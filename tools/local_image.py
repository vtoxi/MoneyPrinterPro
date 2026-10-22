"""Local text-to-image (no API, no network after the first model download).
Usage: python local_image.py --prompt "..." --out out.png [--w 512] [--h 768] [--steps 2] [--seed N]
Model: stabilityai/sd-turbo (1-4 steps, runs on CPU). Override with MPP_LOCAL_MODEL."""
import argparse, os, random, sys

MODEL = os.environ.get("MPP_LOCAL_MODEL", "stabilityai/sd-turbo")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--w", type=int, default=512)
    ap.add_argument("--h", type=int, default=768)
    ap.add_argument("--steps", type=int, default=2)
    ap.add_argument("--seed", type=int, default=random.randint(0, 2**31 - 1))
    a = ap.parse_args()

    import torch
    from diffusers import AutoPipelineForText2Image

    pipe = AutoPipelineForText2Image.from_pretrained(MODEL, torch_dtype=torch.float32)
    pipe.set_progress_bar_config(disable=True)
    img = pipe(
        prompt=a.prompt,
        num_inference_steps=a.steps,
        guidance_scale=0.0,  # turbo models are trained without CFG
        width=a.w, height=a.h,
        generator=torch.Generator("cpu").manual_seed(a.seed),
    ).images[0]
    img.save(a.out)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"local_image error: {e}", file=sys.stderr)
        sys.exit(1)
