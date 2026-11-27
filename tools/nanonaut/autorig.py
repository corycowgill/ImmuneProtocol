"""Learned auto-rigging for the Nanonaut: Make-It-Animatable (CVPR 2025, jasongzy/Make-It-Animatable)
on its Hugging Face ZeroGPU Space predicts a Mixamo-standard skeleton (with fingers) and blend
weights for any humanoid mesh, robust to the triangle soup image-to-3D models produce.

    python tools/nanonaut/autorig.py [work/rig_input.glb]  -> tools/nanonaut/work/autorig/*

The Space runs in two steps on one session: /pipeline predicts the joints and weights (its files
arrive in intermediate updates), then /vis_blender writes the rigged FBX. The build
(build_nanonaut.py) takes the predicted joints and weights from that FBX."""
import os, shutil, sys
from gradio_client import Client, handle_file
from huggingface_hub import get_token

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'work', 'autorig')
NAMES = ['joints_coarse', 'canonicalized', 'samples', 'joints', 'blend_weights', 'rest_pose', 'rest_lbs', 'animatable', 'animatable_file']


def paths(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        for key in ('path', 'value'):
            v = value.get(key)
            if isinstance(v, str):
                return [v]
            if isinstance(v, dict) and isinstance(v.get('path'), str):
                return [v['path']]
    return []


def keep(name, value):
    for path in paths(value):
        if os.path.exists(path):
            target = os.path.join(OUT, name + os.path.splitext(path)[1])
            shutil.copy(path, target)
            print('wrote', target, os.path.getsize(target), flush=True)


def main():
    source = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, 'work', 'rig_input.glb')
    os.makedirs(OUT, exist_ok=True)
    client = Client('jasongzy/Make-It-Animatable', token=get_token(), httpx_kwargs={'timeout': 900})
    # Fingers on, the scan rests in an A-pose, weight post-processing on, kept in its own pose (so the
    # skeleton fits the mesh as it is), no animation.
    job = client.submit(handle_file(source), False, 'A-pose', [], False, .01, False, True, 'LeftArm', False, None, False, True,
                        api_name='/pipeline')
    for update in job:
        for name, value in zip(NAMES, update):
            keep(name, value)
    print('pipeline', job.status().code, flush=True)
    rest, anim_vis, anim = client.predict(False, False, 'A-pose', [], None, False, True, api_name='/vis_blender')
    keep('rest_pose', rest)
    keep('animatable_preview', anim_vis)
    keep('animatable_file', anim)


if __name__ == '__main__':
    main()
