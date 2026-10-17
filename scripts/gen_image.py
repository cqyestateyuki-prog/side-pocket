"""Generate images through Nicrron (async image jobs), e.g. mascot concepts.

    .venv/bin/python scripts/gen_image.py out_dir name="prompt" [name2="prompt2" ...]
"""
import base64
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import httpx
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
BASE = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1")
HEADERS = {"Authorization": "Bearer " + os.environ["NICRRON_API_KEY"]}
MODEL = os.environ.get("NICRRON_IMAGE_MODEL", "google/nano-banana-pro")


def generate(out_dir: Path, name: str, prompt: str, timeout_s: int = 300) -> str:
    for attempt in range(8):  # image jobs are rate-limited; back off on 429
        r = httpx.post(f"{BASE}/images/generations", headers=HEADERS, timeout=60,
                       json={"model": MODEL, "prompt": prompt})
        if r.status_code != 429:
            break
        time.sleep(10 * (attempt + 1))
    r.raise_for_status()
    job = r.json()
    deadline = time.time() + timeout_s
    while job.get("status") not in ("completed", "succeeded", "failed", "error") and "data" not in job:
        if time.time() > deadline:
            return f"{name}: timed out ({job.get('status')})"
        time.sleep(1.5)
        job = httpx.get(f"{BASE}/images/generations/{job['id']}", headers=HEADERS, timeout=60).json()
    if job.get("status") in ("failed", "error"):
        return f"{name}: failed {str(job)[:300]}"
    item = (job.get("data") or [{}])[0]
    path = out_dir / f"{name}.png"
    if job.get("content_url"):  # Nicrron: finished jobs expose a relative content URL
        origin = BASE.split("/v1")[0]
        resp = httpx.get(origin + job["content_url"], headers=HEADERS, timeout=120, follow_redirects=True)
        if resp.status_code != 200 or not resp.headers.get("content-type", "").startswith("image"):
            return f"{name}: download failed {resp.status_code} {resp.text[:200]}"
        path.write_bytes(resp.content)
    elif item.get("b64_json"):
        path.write_bytes(base64.b64decode(item["b64_json"]))
    elif item.get("url"):
        path.write_bytes(httpx.get(item["url"], timeout=120).content)
    else:
        return f"{name}: no image in {str(job)[:300]}"
    return f"{name}: {path} (${job.get('cost')})"


def main() -> None:
    out_dir = Path(sys.argv[1])
    out_dir.mkdir(parents=True, exist_ok=True)
    jobs = [arg.split("=", 1) for arg in sys.argv[2:]]
    with ThreadPoolExecutor(max_workers=1) as pool:
        for line in pool.map(lambda j: generate(out_dir, j[0], j[1]), jobs):
            print(line)


if __name__ == "__main__":
    main()
