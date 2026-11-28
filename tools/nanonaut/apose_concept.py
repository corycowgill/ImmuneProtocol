"""Re-poses a T-pose character render into an A-pose picture for TRELLIS.2, keeping its design.

T-pose scans skin badly once mocap brings the arms down (the scan has no shape for a lowered arm, so
the ribs and armpits smear). FLUX.1 Kontext edits the existing front render instead of inventing a
new character. Run with the logged-in Hugging Face account (a ZeroGPU Space):

    python tools/nanonaut/apose_concept.py <suit> [seed]
"""
import os, sys, shutil, pathlib
from gradio_client import Client, handle_file
from huggingface_hub import get_token

HERE = pathlib.Path(__file__).parent
# A short, direct instruction with firm guidance moves the arms; longer prompts that list what to
# keep leave the T-pose nearly untouched.
# The arms must stand well clear of the body: hanging close, TRELLIS.2 fuses forearm to hip and arm to chest.
PROMPT = 'Lower both arms to a 45 degree A-pose with the hands held well out to the sides of the hips.'
GUIDANCE = 4.0


def main():
    suit = sys.argv[1]
    seed = int(sys.argv[2]) if len(sys.argv) > 2 else 33
    out = HERE / 'concept' / 'suits'
    out.mkdir(parents=True, exist_ok=True)
    client = Client('black-forest-labs/FLUX.1-Kontext-Dev', token=get_token(), httpx_kwargs={'timeout': 600})
    image, _ = client.predict(handle_file(str(HERE.parent / 'trellis' / 'renders' / suit / 'B_front.jpg')), PROMPT, seed, False, GUIDANCE, 28,
                              api_name='/infer')
    path = out / f'{suit}-apose.webp'
    shutil.copy(image['path'] if isinstance(image, dict) else image, path)
    print('wrote', path, os.path.getsize(path), flush=True)


if __name__ == '__main__':
    main()
