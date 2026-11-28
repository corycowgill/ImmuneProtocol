"""Motion capture-quality clips for the Nanonaut from NVIDIA's Kimodo text-to-motion model
(nvidia/Kimodo-SOMA-RP-v1.2, trained on 700 hours of optical motion capture), run on a Hugging
Face ZeroGPU Space with the logged-in account (hf auth login).

    python tools/nanonaut/motion.py [clip ...] [--force]   -> tools/nanonaut/motion/<clip>.npz

Each NPZ holds Kimodo's SOMA skeleton (77 joints, Y up, +Z forward, metres, 30 fps):
posed_joints [T, 77, 3], global_rot_mats, foot_contacts and the root path. build_nanonaut.py
retargets them onto the Nanonaut's skeleton by joint positions. The prompts describe a soldier
holding a rifle so the body carries its weight like one; the hands are put back on the carbine by
IK in the build. manifest.json records each clip's prompt, seed and duration."""
import json, os, shutil, sys, time
from gradio_client import Client
from huggingface_hub import get_token

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'motion')
SPACE = os.environ.get('KIMODO_SPACE', 'hugging-apps/kimodo-motion')
# clip: (prompt, seconds, seed). WANT: the direction a clip should travel (x left, z forward); for
# those, several seeds are tried and the take that travels closest to it without turning is kept.
WANT = {'StrafeL': (1, 0), 'StrafeR': (-1, 0), 'DodgeL': (1, 0), 'DodgeR': (-1, 0), 'Walk': (0, 1), 'WalkBack': (0, -1), 'Run': (0, 1)}
TRIES = 8
CLIPS = {
    'Stand': ('A soldier stands still in a ready combat stance holding a rifle at the shoulder, feet apart, knees slightly bent, shifting weight slightly.', 4, 11),
    'Walk': ('A soldier walks forward at a steady tactical pace, aiming a rifle forward down the sights.', 4, 7),
    'WalkBack': ('A soldier walks backward slowly and steadily, aiming a rifle forward.', 4, 5),
    'StrafeL': ('A soldier walks sideways to his left, stepping sideways without turning, chest and rifle facing straight ahead the whole time.', 4, 3),
    'StrafeR': ('A soldier walks sideways to his right, stepping sideways without turning, chest and rifle facing straight ahead the whole time.', 4, 3),
    'Run': ('A soldier runs forward fast holding a rifle across his chest.', 4, 9),
    'Crouch': ('A soldier kneels down on his right knee and stays kneeling, aiming a rifle forward.', 4, 4),
    'CrouchWalk': ('A soldier moves forward slowly in a low crouch, knees deeply bent, holding a rifle.', 4, 6),
    'DodgeL': ('A soldier quickly dives sideways to his left, lands and comes up crouched.', 2, 8),
    'DodgeR': ('A soldier quickly dives and rolls to his right, then comes up crouched.', 2, 8),
    'Stagger': ('A soldier is hit hard in the chest, flinches and staggers one step backward, then recovers.', 2, 2),
    'DeathBack': ('A soldier is shot, his knees buckle and he collapses backward onto the ground and lies still.', 3, 12),
    # Upper body: the carbine is placed from these hands in the build (grip in the right, barrel toward the left).
    'Aim': ('A soldier stands still aiming a rifle at shoulder height, both hands on the rifle, looking down the sights, breathing steadily.', 4, 21),
    'LowReady': ('A soldier stands holding a rifle at low ready across his chest with both hands, muzzle pointed down, scanning left and right.', 4, 22),
    'Cover': ('A soldier crouches low behind cover holding his rifle upright close to his chest with both hands, ducking his head.', 4, 23),
    'Reload': ('A soldier standing holds his rifle with his right hand, removes the magazine with his left hand, inserts a new magazine and pulls the charging handle, then aims again.', 3, 24),
    'Fire': ('A soldier stands firing a rifle in short controlled bursts, the rifle kicking against his shoulder, both hands on the rifle.', 3, 25),
    # Lobby idle: relaxed, rifle held low across the body, as in other multiplayer games' lobbies.
    'AtEase': ('A relaxed soldier stands waiting with his rifle held at low ready, angled down toward the floor in front of him, '
               'both hands on the rifle, shifting his weight.', 6, 31),
    'DeathFront': ('A soldier is shot in the back, stumbles forward and falls face down onto the ground and lies still.', 3, 12),
}


def take_score(npz, want):
    """How far a take strays from the intended travel direction (radians), plus how much it turns."""
    import math
    import numpy as np
    if not want:
        return 0.0
    d = np.load(npz)
    r, pj = d['root_positions'], d['posed_joints']
    travel = r[-1] - r[0]
    off = abs(math.atan2(travel[0] * want[1] - travel[2] * want[0], travel[0] * want[0] + travel[2] * want[1]))
    hips = pj[:, 67] - pj[:, 72]
    face = np.unwrap(np.arctan2(-hips[:, 2], hips[:, 0]))
    # A right-handed rifle hold: the left hand leads the right along the facing direction.
    forward = np.stack([-hips[:, 2], np.zeros(len(hips)), hips[:, 0]], 1)
    forward /= np.linalg.norm(forward, axis=1, keepdims=True)
    lead = pj[:, 14] - pj[:, 42]
    hand = float(np.mean(np.einsum('ij,ij->i', lead, forward)) / max(1e-6, np.mean(np.linalg.norm(lead, axis=1))))
    return off + .5 * float(np.ptp(face)) + 2 * max(0, .5 - hand)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    force = '--force' in sys.argv
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'manifest.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {}
    client = Client(SPACE, token=get_token(), httpx_kwargs={'timeout': 600})
    for name in args or CLIPS:
        prompt, seconds, seed = CLIPS[name]
        path = os.path.join(OUT, name + '.npz')
        entry = {'prompt': prompt, 'seconds': seconds, 'seed': seed, 'model': 'nvidia/Kimodo-SOMA-RP', 'space': SPACE}
        if os.path.exists(path) and not force and all(manifest.get(name, {}).get(k) == v for k, v in entry.items()):
            print('cached', name, flush=True)
            continue
        best = None
        for take in range(TRIES if name in WANT else 1):
            for attempt in range(3):
                try:
                    _, files, info = client.predict(prompt, float(seconds), None, seed + take * 101, 100, 2.0, 2.0, True, api_name='/generate')
                    break
                except Exception as error:  # ZeroGPU queues can drop a request; try again
                    print('retry', name, error, flush=True)
                    time.sleep(5)
            else:
                raise SystemExit('Kimodo failed for ' + name)
            npz = next(f for f in files if f.endswith('.npz'))
            score = take_score(npz, WANT.get(name))
            print(f'  {name} seed {seed + take * 101}: score {score:.2f}', flush=True)
            if best is None or score < best[0]:
                best = (score, npz, seed + take * 101, info)
        score, npz, entry['chosen_seed'], info = best
        shutil.copy(npz, path)
        manifest[name] = {**entry, 'info': info}
        json.dump(manifest, open(manifest_path, 'w'), indent=1)
        print('wrote', name, info, flush=True)


if __name__ == '__main__':
    main()
