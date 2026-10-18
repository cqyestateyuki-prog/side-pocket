"""Tilly (formerly Atlas) poses: generate on Nicrron (google/nano-banana-pro), cut to transparent PNG, build contact sheets.

    .venv/bin/python design/mascots/atlas_v2/make.py gen [pose ...] [--cand a|b|c|d|e|f]
    .venv/bin/python design/mascots/atlas_v2/make.py cut
    .venv/bin/python design/mascots/atlas_v2/make.py sheet     # v2 candidates a/b -> sheet.png, pick.html
    .venv/bin/python design/mascots/atlas_v2/make.py sheet3    # product poses vs original wave, picks -> sheet-v3.png

Nicrron's image endpoint takes only model, prompt and seed (no reference image), so consistency comes from
reusing the character and style wording of the original atlas_flat sheet word for word. Candidates differ by seed.
"""
import os
import sys
import time
from collections import deque
from pathlib import Path

import httpx
import numpy as np
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
RAW, OUT = HERE / "raw", HERE / "png"
load_dotenv(ROOT / ".env")

# Character and style sentences copied from the prompt that made design/mascots/atlas_flat/sheet.png.
CHARACTER = (
    "The character: Tilly, a chubby carrier pigeon with a round lilac head, blush-pink body, small pink beak, eyes always drawn as happy closed "
    "upward crescent arcs like ^ ^ with rosy cheek blush, a small brown cross-body satchel with gold coins, a cream map-print neck scarf."
)
STYLE = (
    "Style: flat 2D illustration, hand-drawn sticker art with confident dark-plum outlines, flat pastel color fills with subtle risograph grain, "
    "Gen-Z kawaii character design, not 3D, no gradients, no realistic lighting."
)
FRAME = (
    "A single full-body pose of ONE mascot character, centered with generous empty margin on every side, plain pure white background, "
    "no text, no letters, no numbers, no symbols, no logos. Not a die-cut sticker: no white sticker edge, no outer outline, no drop shadow."
)
# Details the original sheet shows that a single pose tends to lose.
DETAILS = (
    "Small pink feet. The scarf is a cream bandana neckerchief tied in a small knot at the side, with a faint beige map print. "
    # Round d/e/f: the original wave/celebrate art has these, and a/b lost them on some poses (e.g. all-pink trophy wings).
    "Both wings are blush pink with soft lilac-purple tips on the outer flight feathers, and the short tail feathers are lilac, "
    "the same lilac as the head."
)
EYES = "The eyes are closed happy arcs ^ ^ with no pupils and no dots."

POSES = {
    "coin": "Pose: proudly holding up one big shiny blank gold coin with both wings, beaming.",
    "coin-stack": "Pose: sitting happily on top of a tall neat stack of blank gold coins, feet dangling over the edge.",
    "trophy": "Pose: lifting a shiny gold trophy cup above its head with both wings, celebrating.",
    "medal": "Pose: standing proudly, wearing a gold medal on a pink ribbon around its neck, one wing touching the medal.",
    "piggy-bank": "Pose: dropping a blank gold coin into the slot of a small pink piggy bank standing next to it.",
    "ledger": "Pose: writing in an open notebook ledger with a yellow pencil, the pages show only wavy scribble lines.",
    "receipt": "Pose: reading a very long paper receipt that curls down to the floor, the receipt shows only wavy scribble lines.",
    "laptop": "Pose: sitting and typing happily on a small lavender laptop with a blank lid, no logo.",
    "creator": "Pose: a content creator wearing pink over-ear headphones, holding a small handheld video camera and filming.",
    "calculator": "Pose: tapping a big chunky pocket calculator with one wing tip; it has a small grey screen and a grid of round pastel buttons with no markings.",
    "globe": "Pose: hugging a small desk globe with soft pastel continents in both wings.",
    "envelope": "Pose: flying with wings spread wide, carrying a cream envelope with a pink heart seal, payout arrived.",
    "flag": "Pose: standing on top of a small round green hill, planting a little pink triangle flag, goal reached.",
    "thumbs-up": "Pose: giving a confident thumbs-up with one wing, the other wing resting on its hip.",
    "sleeping": "Pose: curled up asleep on a soft lavender pillow, eyes closed as gentle downward arcs, a few small round sleep bubbles.",
    "star-badge": "Pose: holding up a big shiny gold star badge with both wings.",
}
SEEDS = {"a": 1100, "b": 2200, "c": 3300, "d": 4400, "e": 5500, "f": 6600}  # c: retry; d/e/f: lilac-wing round
ROUND3 = ("d", "e", "f")
PRODUCT_POSES = ("coin", "coin-stack", "trophy", "medal", "piggy-bank", "ledger",
                 "receipt", "laptop", "globe", "envelope", "flag", "star-badge")


def prompt_for(pose: str) -> str:
    eyes = "" if pose == "sleeping" else " " + EYES
    return f"{FRAME} {CHARACTER} {DETAILS} {POSES[pose]}{eyes} {STYLE}"


def generate(pose: str, cand: str) -> str:
    """One job; an upstream failure (Nicrron reported "upstream fal returned 403") is retried with backoff."""
    for wait in (30, 90, 180, 0):
        result = _generate_once(pose, cand)
        if " failed {" not in result or not wait:
            return result
        print(f"{result[:160]} ... retrying in {wait}s", flush=True)
        time.sleep(wait)
    return result


def _generate_once(pose: str, cand: str) -> str:
    base = os.environ.get("NICRRON_BASE_URL", "https://api.nicrron.ai/v1")
    headers = {"Authorization": "Bearer " + os.environ["NICRRON_API_KEY"]}
    origin = base.split("/v1")[0]
    body = {"model": "google/nano-banana-pro", "prompt": prompt_for(pose),
            "seed": SEEDS[cand] + list(POSES).index(pose)}
    for attempt in range(8):
        r = httpx.post(f"{base}/images/generations", headers=headers, json=body, timeout=60)
        if r.status_code != 429:
            break
        time.sleep(10 * (attempt + 1))
    r.raise_for_status()
    job = r.json()
    deadline = time.time() + 300
    while job.get("status") not in ("completed", "succeeded", "failed", "error"):
        if time.time() > deadline:
            return f"{pose}-{cand}: timed out"
        time.sleep(1)  # finished outputs expire within seconds (410), so poll fast
        g = httpx.get(f"{base}/images/generations/{job['id']}", headers=headers, timeout=60)
        if g.status_code == 429:
            time.sleep(5)
            continue
        job = g.json()
    if job.get("status") in ("failed", "error") or not job.get("content_url"):
        return f"{pose}-{cand}: failed {str({k: v for k, v in job.items() if k != 'prompt'})[:300]}"
    for _ in range(8):  # right after "succeeded" the file can answer 410 for a second or two
        img = httpx.get(origin + job["content_url"], headers=headers, timeout=120, follow_redirects=True)
        if img.status_code == 200 and img.headers.get("content-type", "").startswith("image"):
            break
        time.sleep(2)
    else:
        return f"{pose}-{cand}: download failed {img.status_code} ({job['id']})"
    RAW.mkdir(exist_ok=True)
    path = RAW / f"{pose}-{cand}.png"
    path.write_bytes(img.content)
    return f"{pose}-{cand}: ok (${job.get('cost')})"


def cut_background(img: Image.Image) -> Image.Image:
    """Same cut as web/assets/mascot: flood from the border through near-white only, so enclosed whites survive."""
    a = np.array(img.convert("RGBA"))
    near_white = a[..., :3].astype(int).min(axis=2) > 232
    h, w = near_white.shape
    seen = np.zeros_like(near_white)
    q = deque([(y, x) for y in range(h) for x in (0, w - 1)] + [(y, x) for x in range(w) for y in (0, h - 1)])
    while q:
        y, x = q.popleft()
        if y < 0 or x < 0 or y >= h or x >= w or seen[y, x] or not near_white[y, x]:
            continue
        seen[y, x] = True
        q.extend(((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)))
    a[..., 3] = np.where(seen, 0, 255)
    return Image.fromarray(a)


def cut() -> None:
    OUT.mkdir(exist_ok=True)
    for raw in sorted(RAW.glob("*.png")):
        if (OUT / raw.name).exists():
            continue
        img = cut_background(Image.open(raw))
        img = img.crop(img.getbbox())
        scale = 496 / max(img.size)
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
        canvas = Image.new("RGBA", (img.width + 16, img.height + 16), (0, 0, 0, 0))
        canvas.paste(img, (8, 8))
        canvas.save(OUT / raw.name, optimize=True)
        print(raw.name, canvas.size)


# Best candidate per pose, chosen from the contact sheet.
PICKS: dict[str, str] = {
    "coin": "b", "coin-stack": "a", "trophy": "a", "medal": "a", "piggy-bank": "b", "ledger": "a",
    "receipt": "a", "laptop": "a", "creator": "b", "calculator": "b", "globe": "a", "envelope": "a",
    "flag": "a", "thumbs-up": "a", "sleeping": "a", "star-badge": "a",
}


def sheet() -> None:
    """sheet.png and pick.html: every candidate in pose order, the pick outlined in violet."""
    files = [OUT / f"{pose}-{cand}.png" for pose in POSES for cand in SEEDS if (OUT / f"{pose}-{cand}.png").exists()]
    cols, cell, label_h = 8, 240, 34
    rows = -(-len(files) // cols)
    page = Image.new("RGB", (cols * cell, rows * (cell + label_h)), "#F8F7FC")
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    draw = ImageDraw.Draw(page)
    for i, f in enumerate(files):
        x, y = (i % cols) * cell, (i // cols) * (cell + label_h)
        pose, cand = f.stem.rsplit("-", 1)
        if PICKS.get(pose) == cand:
            draw.rounded_rectangle((x + 4, y + 4, x + cell - 4, y + cell + label_h - 4), 18, outline="#6B5BC2", width=4)
        im = Image.open(f)
        im.thumbnail((cell - 32, cell - 32), Image.LANCZOS)
        page.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2 + 6), im)
        draw.text((x + 16, y + cell - 2), f"{pose} · {cand}", fill="#4B4D66", font=font)
    page.save(HERE / "sheet.png", optimize=True)
    cards = []
    for pose in POSES:
        for cand in SEEDS:
            if (OUT / f"{pose}-{cand}.png").exists():
                pick = PICKS.get(pose) == cand
                cards.append(f'<figure class="{"pick" if pick else ""}"><img src="png/{pose}-{cand}.png" alt="Atlas, {pose} pose, candidate {cand}">'
                             f'<figcaption>{pose} · {cand}{" · pick" if pick else ""}</figcaption></figure>')
    (HERE / "pick.html").write_text(PICK_HTML.replace("{cards}", "\n".join(cards)))
    print("sheet", page.size, len(files))


PICK_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Atlas poses v2</title>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;700;800&display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 40px 24px; background: #F8F7FC; color: #191A2B; font-family: 'Plus Jakarta Sans', Arial, sans-serif; }
  h1 { font-size: 32px; font-weight: 800; margin: 0 0 6px; }
  p { color: #4B4D66; margin: 0 0 28px; }
  main { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
  figure { margin: 0; background: #FFFFFF; border: 1px solid #E4E1F0; border-radius: 24px; padding: 16px; text-align: center; }
  figure.pick { border: 3px solid #6B5BC2; }
  img { width: 100%; height: 200px; object-fit: contain; }
  figcaption { font-size: 14px; color: #4B4D66; margin-top: 8px; }
  .pick figcaption { color: #5848AA; font-weight: 700; }
</style></head>
<body>
<h1>Atlas poses v2</h1>
<p>Two candidates per pose. The outlined one is the pick. Transparent PNGs, 512 px on the long side, in png/.</p>
<main>
{cards}
</main>
</body></html>
"""


# Product pick per pose after the lilac-wing check (lilac wing tips and tail, crescent eyes, flat, no text).
# Round d/e/f could not run (Nicrron image upstream "fal returned 403"), so trophy and ledger moved to the
# existing candidates that already have the lilac tips and tail; the rest already had them.
PICKS3: dict[str, str] = {
    "coin": "b", "coin-stack": "a", "trophy": "b", "medal": "a", "piggy-bank": "b", "ledger": "b",
    "receipt": "a", "laptop": "a", "globe": "a", "envelope": "a", "flag": "a", "star-badge": "a",
}


def sheet3() -> None:
    """sheet-v3.png: the original wave.png first for comparison, then every candidate of each product pose, pick outlined."""
    ref = ROOT / "web/assets/mascot/wave.png"
    cells = [(ref, "original wave", False)] + [
        (OUT / f"{pose}-{cand}.png", f"{pose} · {cand}", PICKS3.get(pose) == cand)
        for pose in PRODUCT_POSES for cand in SEEDS if (OUT / f"{pose}-{cand}.png").exists()]
    cols, cell, label_h = 7, 260, 34
    rows = -(-len(cells) // cols)
    page = Image.new("RGB", (cols * cell, rows * (cell + label_h)), "#F8F7FC")
    font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 18)
    draw = ImageDraw.Draw(page)
    for i, (f, label, pick) in enumerate(cells):
        x, y = (i % cols) * cell, (i // cols) * (cell + label_h)
        if pick or i == 0:
            draw.rounded_rectangle((x + 4, y + 4, x + cell - 4, y + cell + label_h - 4), 18,
                                   outline="#6B5BC2" if pick else "#C42F78", width=4)
        im = Image.open(f)
        im.thumbnail((cell - 32, cell - 32), Image.LANCZOS)
        page.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2 + 6), im)
        draw.text((x + 16, y + cell - 2), label, fill="#4B4D66", font=font)
    page.save(HERE / "sheet-v3.png", optimize=True)
    print("sheet-v3", page.size, len(cells))


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "gen":
        cands = [args[args.index("--cand") + 1]] if "--cand" in args else list(SEEDS)
        poses = [a for a in args if a in POSES] or list(POSES)
        for cand in cands:
            for pose in poses:
                print(generate(pose, cand), flush=True)
    elif cmd == "cut":
        cut()
    elif cmd == "sheet":
        sheet()
    elif cmd == "sheet3":
        sheet3()
