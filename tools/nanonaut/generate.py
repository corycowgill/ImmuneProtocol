"""Image-to-3D for the enemy Nanonaut on Hugging Face ZeroGPU Spaces, with the logged-in account.

    python tools/nanonaut/generate.py trellis2 <concept.png> [seed]   -> originals/nanonaut-trellis2-<seed>.glb
    python tools/nanonaut/generate.py hunyuan <concept.png> [seed] [back.png]  -> originals/nanonaut-hunyuan-<seed>.glb

TRELLIS.2 (microsoft/TRELLIS.2) at its 1536 resolution with PBR textures is the primary source;
Hunyuan3D-2.1 (tencent/Hunyuan3D-2.1, optionally with a back view) is generated to compare."""
import os, sys, shutil, pathlib
from gradio_client import Client, handle_file
from huggingface_hub import get_token

OUT = pathlib.Path(__file__).parent / 'originals'
NAME = os.environ.get('NAME', 'nanonaut')  # file prefix: the Nanonaut or a co-op suit


def client(space):
    return Client(space, token=get_token(), httpx_kwargs={'timeout': 900})


def trellis2(image, seed):
    c = client('microsoft/TRELLIS.2')
    c.predict(api_name='/start_session')
    prompt = c.predict(handle_file(image), api_name='/preprocess_image')
    prompt = prompt['path'] if isinstance(prompt, dict) else prompt
    shutil.copy(prompt, OUT / f'{NAME}-trellis2-{seed}-prompt.png')
    c.predict(handle_file(prompt), seed, '1536', 7.5, .7, 12, 5.0, 7.5, .5, 12, 3.0, 1.0, 0.0, 12, 3.0, api_name='/image_to_3d')
    glb, _ = c.predict(300000, 4096, api_name='/extract_glb')
    path = OUT / f'{NAME}-trellis2-{seed}.glb'
    shutil.copy(glb, path)
    return path


def hunyuan(image, seed, back=None):
    c = client('tencent/Hunyuan3D-2.1')
    out = c.predict(handle_file(image), handle_file(image) if back else None, handle_file(back) if back else None, None, None,
                    50, 5.0, seed, 512, True, 8000, False, api_name='/generation_all')
    textured = out[1] if out[1] else out[0]
    path = OUT / f'{NAME}-hunyuan-{seed}.glb'
    shutil.copy(textured if isinstance(textured, str) else textured['path'], path)
    return path


def main():
    kind, image = sys.argv[1], sys.argv[2]
    seed = int(sys.argv[3]) if len(sys.argv) > 3 else 7
    OUT.mkdir(exist_ok=True)
    path = trellis2(image, seed) if kind == 'trellis2' else hunyuan(image, seed, sys.argv[4] if len(sys.argv) > 4 else None)
    print('wrote', path, os.path.getsize(path), flush=True)


if __name__ == '__main__':
    main()
