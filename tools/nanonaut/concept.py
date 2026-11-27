"""Concept art for the enemy Nanonaut, generated with FLUX.1 Krea on a Hugging Face ZeroGPU Space.

python tools/nanonaut/concept.py [count]   -> tools/nanonaut/concept/<n>.png
The chosen image feeds TRELLIS (tools/nanonaut/generate.py)."""
import os, sys, pathlib
import shutil
from gradio_client import Client
from huggingface_hub import get_token

OUT = pathlib.Path(__file__).parent / 'concept'
PROMPT = (
    "full body character turnaround sheet, single figure, orthographic front view, game character model reference, "
    "a hostile special forces soldier in a sealed hazmat biosuit, realistic adult male proportions, eight heads tall, long legs, broad shoulders, "
    "standing in a relaxed A-pose with both arms held straight down and out at 40 degrees away from the body, open hands with separated fingers, "
    "feet shoulder width apart, clear gaps between the arms and the torso and between the legs, "
    "crimson red rubberized suit with hard-surface armor plates on chest, shoulders, forearms, thighs and shins, "
    "hazard yellow chevron stripes and yellow trims, black tactical chest rig with magazine pouches, black belt and thigh holster, "
    "fully enclosed rounded helmet with a large dark smoked visor and twin respirator filters, black gloves, black combat boots, "
    "crisp sharp hard-surface detail, clean silhouette, weathered paint, physically based materials, "
    "even flat studio lighting, no cast shadows, plain light grey seamless background, no weapon, no text, unreal engine 5 render, 8k"
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
