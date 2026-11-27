# Generates the Mega Nano Bot's sound effects with Stable Audio Open 1.0
# (stabilityai/stable-audio-open-1.0, via diffusers), then trims, fades and normalises them into
# 16-bit mono 32 kHz WAVs. Runs on CPU; a few minutes per cue.
#
#   python tools/audio/generate_nanobot_sfx.py OUT_DIR [name ...] [--takes N]
#
# Writes OUT_DIR/<name>-<take>.wav for each take; the chosen take is copied by hand to
# dist/assets/sfx/nanobot/<name>.wav. The model gave the EMP and shield-up prompts only sub-bass,
# so those three are cut from its other takes: emp-charge is shield-down reversed (its last 1.4 s),
# emp-blast is emp-blast take 0 layered with shield-down, and shield-up is shield-up take 1
# reversed over take 0's hum. Needs torch, diffusers, torchsde, soundfile, scipy.
import os, sys
import numpy as np
import soundfile as sf
import torch
from diffusers import StableAudioPipeline
from scipy.signal import resample_poly

NEGATIVE = 'music, melody, singing, voice, speech, talking, low quality, distorted, clipping, noise floor hiss'
# name: (seconds, prompt)
CUES = {
    'arrive': (5.0, 'Massive sci-fi war machine descending from above, deep jet engine roar and heavy mechanical hum growing louder, thunderous cinematic sound effect'),
    'salvo-launch': (2.5, 'Rapid salvo of missiles launching from a metal pod, rocket ignitions whooshing away in quick succession, sci-fi weapon sound effect'),
    'salvo-impact': (3.0, 'Several missile explosions hitting the ground in quick succession, heavy booms with debris, cinematic sound effect'),
    'laser-charge': (1.6, 'Sci-fi laser cannon charging up, fast rising electrical whine, high-tech energy buildup sound effect'),
    'laser-burn': (3.2, 'Powerful continuous sci-fi laser beam firing, intense sizzling energy beam with a deep buzzing hum, sound effect'),
    'emp-charge': (1.6, 'Sci-fi electric generator charging up, rising high-pitched electrical whine with crackling static and sparks, sound effect'),
    'emp-blast': (2.6, 'Sci-fi EMP blast, loud sharp electric zap and crackling discharge with sparks and static, then electronics shutting down with a descending whine, sound effect'),
    'shield-down': (2.6, 'Energy force field shattering, glassy electric crash and power failure, sci-fi shield breaking sound effect'),
    'shield-up': (2.0, 'Sci-fi energy shield activating, bright shimmering electric hum rising in pitch with sparkling crackles, sound effect'),
    'pylon-break': (1.6, 'Crystal energy pylon exploding, glass shattering with an electrical zap and a burst of sparks, sci-fi sound effect'),
    'drone-bay': (2.2, 'Heavy mechanical hatch opening with a hydraulic hiss, then small robotic drones launching with buzzing rotors, sci-fi sound effect'),
    'death': (4.6, 'Giant robot war machine powering down, failing engines sputtering and electrical sparks, then a huge metal crash and a massive explosion, cinematic sound effect'),
    'shield-hit': (1.0, 'Single bullet hitting an energy shield, short bright electric deflection zap, sci-fi sound effect'),
    'armour-hit': (1.0, 'Single bullet ricochet off thick metal armor plate, sharp metallic ping, sound effect'),
}
RATE = 32000

def finish(audio, rate, seconds):
    mono = audio.mean(axis=0) if audio.ndim == 2 else audio
    mono = resample_poly(mono, RATE, rate)
    mono = mono[: int(seconds * RATE)]
    mono -= mono.mean()
    # Trim leading silence (keep 10 ms) and a tail below -50 dB.
    level = np.abs(mono)
    peak = level.max() or 1
    loud = np.where(level > peak * .03)[0]
    if len(loud):
        start = max(0, loud[0] - int(.01 * RATE))
        end = min(len(mono), np.where(level > peak * .003)[0][-1] + int(.05 * RATE))
        mono = mono[start:end]
    fade_in, fade_out = int(.004 * RATE), min(len(mono) // 3, int(.12 * RATE))
    mono[:fade_in] *= np.linspace(0, 1, fade_in)
    mono[-fade_out:] *= np.linspace(1, 0, fade_out)
    return mono / (np.abs(mono).max() or 1) * .89

def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    takes = int(next((a.split('=')[1] for a in sys.argv if a.startswith('--takes=')), 2))
    out, names = args[0], args[1:] or list(CUES)
    os.makedirs(out, exist_ok=True)
    torch.set_num_threads(os.cpu_count())
    pipe = StableAudioPipeline.from_pretrained('stabilityai/stable-audio-open-1.0', torch_dtype=torch.float32)
    rate = pipe.vae.sampling_rate
    for name in names:
        seconds, prompt = CUES[name]
        for take in range(takes):
            path = os.path.join(out, f'{name}-{take}.wav')
            if os.path.exists(path):
                continue
            generator = torch.Generator('cpu').manual_seed(1000 + take * 77 + len(name))
            audio = pipe(prompt, negative_prompt=NEGATIVE, num_inference_steps=int(os.environ.get('STEPS', 60)), guidance_scale=7,
                         audio_end_in_s=max(2.0, seconds + .4), generator=generator).audios[0]
            sf.write(path, finish(audio.float().numpy(), rate, seconds), RATE, subtype='PCM_16')
            print('wrote', path, flush=True)

if __name__ == '__main__':
    main()
