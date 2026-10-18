"""Write the sample statements behind "Try sample statements" on My data (web/demo/samples/).

One CSV per platform for the demo persona (C01, Moon Spirit), holding only her rows, exactly as the
platform export would look for her. Fictional data. No rate file is written, so the sample shows the
ECB reference-rate path; the demo rate tables stay in daoshou_testdata/.

    .venv/bin/python scripts/make_samples.py
"""
from __future__ import annotations

import json
from pathlib import Path

from daoshou import data

OUT = Path(__file__).resolve().parents[1] / "web" / "demo" / "samples"


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    c = data.find_creator("C01")
    files = []
    for platform, account in c["accounts"].items():
        name = data.EXPORTS[platform][0]
        # Bilibili's export is UTF-8 with a byte-order mark, like the original file.
        text = data.export_csv(platform, account)
        (OUT / name).write_text(("﻿" if platform == "bilibili" else "") + text, encoding="utf-8")
        files.append(name)
    (OUT / "index.json").write_text(json.dumps({"files": files}, indent=1) + "\n", encoding="utf-8")
    print(f"{len(files)} sample statements in {OUT}")


if __name__ == "__main__":
    main()
