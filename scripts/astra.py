"""Ask GPT-6 Astra (via Nicrron) for product copy, grounded in docs/product_brief.md.

    .venv/bin/python scripts/astra.py "Write the README intro ..." [-o out.md]

All pitch and product copy in this project is written by GPT-6 Astra; Claude writes code.
"""
import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from daoshou.prism_tracing import nicrron_client  # noqa: E402

MODEL = "openai/gpt-6-astra"
SYSTEM = ("You are a senior product copywriter for fintech products. Use only the facts in the fact sheet; "
          "never invent numbers, features, customers or claims. Plain, confident, specific language.")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("task")
    p.add_argument("-o", "--out")
    args = p.parse_args()
    brief = (ROOT / "docs" / "product_brief.md").read_text(encoding="utf-8")
    r = nicrron_client().chat.completions.create(model=MODEL, messages=[
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": f"FACT SHEET:\n\n{brief}\n\nTASK:\n{args.task}"},
    ])
    text = r.choices[0].message.content
    if args.out:
        Path(args.out).write_text(text, encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
