"""Concept art for the enemy Nanonaut, generated with FLUX.1 Krea on a Hugging Face ZeroGPU Space.

python tools/nanonaut/concept.py [count]   -> tools/nanonaut/concept/<n>.png
The chosen image feeds TRELLIS (tools/nanonaut/generate.py)."""
import os, sys, pathlib
import shutil
from gradio_client import Client
from huggingface_hub import get_token

OUT = pathlib.Path(__file__).parent / 'concept'
PROMPT = (
    "full body photoreal 3D character render of a hostile sci-fi hazmat soldier in a sealed biosuit, "
    "standing in a strict T-pose with arms straight out to the sides, palms down, legs slightly apart, front view, "
    "symmetric, centered, the whole figure visible from helmet to boots, "
    "the suit is bright crimson red armored plating with hazard yellow panels, yellow chevron stripes and yellow knee and shoulder guards, "
    "dark charcoal rubber joints, black tactical gloves and black armored boots, chest rig with ammo pouches, utility belt, "
    "sealed rounded helmet with a dark tinted visor glowing faint orange, small respirator filters on the jaw, "
    "worn chipped paint, weathered, hard surface detail, military tactical gear, "
    "studio lighting, plain light grey seamless background, no weapon, no text, game character concept, unreal engine 5 render"
)

def main():
    count = int(sys.argv[1]) if len(sys.argv) > 1 else 4
    OUT.mkdir(exist_ok=True)
    client = Client(os.environ.get('HF_IMAGE_SPACE', 'black-forest-labs/FLUX.1-Krea-dev'), token=get_token())
    first = int(os.environ.get('SEED', 1700))
    for i in range(count):
        result, seed = client.predict(PROMPT, first + i, False, 1024, 1024, 4.5, 30, api_name='/infer')
        path = OUT / f'{first + i}.png'
        shutil.copy(result['path'] if isinstance(result, dict) else result, path)
        print('wrote', path, 'seed', seed, flush=True)

if __name__ == '__main__':
    main()
