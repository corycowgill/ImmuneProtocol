"""Image-to-3D for the enemy Nanonaut on the TRELLIS Hugging Face ZeroGPU Space.

python tools/nanonaut/generate.py <concept.png> [seed]  -> tools/nanonaut/originals/nanonaut-<seed>.glb
Uses the logged-in Hugging Face account (hf auth login) for ZeroGPU quota."""
import os, sys, shutil, pathlib
from gradio_client import Client, handle_file
from huggingface_hub import get_token

OUT = pathlib.Path(__file__).parent / 'originals'

def main():
    image = sys.argv[1]
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 7
    OUT.mkdir(exist_ok=True)
    client = Client(os.environ.get('TRELLIS_SPACE', 'trellis-community/TRELLIS'), token=get_token(), httpx_kwargs={'timeout': 600})
    client.predict(api_name='/start_session')
    print('session started', flush=True)
    prompt = client.predict(handle_file(image), api_name='/preprocess_image')
    shutil.copy(prompt['path'] if isinstance(prompt, dict) else prompt, OUT / f'nanonaut-{seed}-prompt.png')
    video, model, glb = client.predict(handle_file(prompt['path'] if isinstance(prompt, dict) else prompt), [], seed,
                                       7.5, 25, 3.0, 25, 'stochastic', 0.9, 2048, api_name='/generate_and_extract_glb')
    shutil.copy(glb, OUT / f'nanonaut-{seed}.glb')
    if video: shutil.copy(video['video'] if isinstance(video, dict) else video, OUT / f'nanonaut-{seed}.mp4')
    print('wrote', OUT / f'nanonaut-{seed}.glb', os.path.getsize(OUT / f'nanonaut-{seed}.glb'), flush=True)

if __name__ == '__main__':
    main()
