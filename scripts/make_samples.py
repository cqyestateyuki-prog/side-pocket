"""Write Moon Spirit's account into web/demo/samples/: the app opens on it (lib/seed.js loads it into the
browser store the first time, through the same path as an upload).

One CSV per platform holding only her rows, exactly as each platform's export would look for her, plus
the demo rate tables as her rate files (so her numbers match the bundled demo), and index.json with
her manual entries, monthly goal, payout methods and set-aside rate. Fictional data.

    .venv/bin/python scripts/make_samples.py
"""
from __future__ import annotations

import json
from pathlib import Path

from daoshou import data

OUT = Path(__file__).resolve().parents[1] / "web" / "demo" / "samples"
RATE_FILES = ["fx_rates_cny_per_usd.csv", "fx_rates_usd_per_unit.csv"]


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
    for name in RATE_FILES:
        (OUT / name).write_text((data.DATA / name).read_text(encoding="utf-8"), encoding="utf-8")
        files.append(name)
    own = json.loads((data.DATA / "manual_entries.json").read_text(encoding="utf-8"))["creators"]["C01"]
    profile = {
        "entries": own["entries"],
        "settings": {"tax_home": c["tax_country"], "set_aside_rate": c["set_aside_rate"],
                     "monthly_goal": own.get("monthly_goal"), "payout_methods": c.get("payout_methods", {})},
    }
    (OUT / "index.json").write_text(json.dumps({"files": files, "profile": profile}, indent=1, ensure_ascii=False) + "\n",
                                    encoding="utf-8")
    print(f"{len(files)} sample files in {OUT}")


if __name__ == "__main__":
    main()
