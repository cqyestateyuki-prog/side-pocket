"""Kit v1.3.1 screen 17 data from the real backend (writes data-v131-ledger.js):
    .venv/bin/python "design/Side-Atlas-Design-Kit v1/07-mockups/gen_ledger_v131.py" > "design/Side-Atlas-Design-Kit v1/07-mockups/data-v131-ledger.js"

Posts creator C01's exports, relabelled the way the browser does (acct-NNNN), to POST /api/personal/ledger
in-process (FastAPI TestClient), August 2026, display CNY, tax home China. Two cases:
  ecb:  no rate file, so USD records use ECB reference rates (fetched by daoshou/fx.py: network, currency
        codes and a date range only);
  file: the demo CNY rate table uploaded as the user's rate file with 2026-08-26 removed, to show the stop.
"""
import csv, hashlib, io, json, sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient  # noqa: E402
from api.main import app  # noqa: E402
from daoshou import data  # noqa: E402

GAP = "2026-08-26"
c = data.find_creator("C01")
def label(acct):
    return "acct-" + str(int(hashlib.sha256(("side-atlas:" + acct).encode()).hexdigest(), 16) % 10000).zfill(4)
files = []
for p, acct in c["accounts"].items():
    rows = list(csv.DictReader(io.StringIO(data.export_csv(p, acct))))
    col, out = data.EXPORTS[p][1], io.StringIO()
    w = csv.DictWriter(out, fieldnames=list(rows[0]), lineterminator="\n"); w.writeheader()
    for r in rows:
        r[col] = label(r[col]); w.writerow(r)
    files.append({"name": data.EXPORTS[p][0], "content": out.getvalue()})
body = {"files": files, "tax_home": "CN", "currency": "CNY", "set_aside_rate": 0.25, "month": "2026-08",
        "after": "2026-10-17", "payout_methods": c.get("payout_methods", {})}
rates = list(csv.DictReader(open(data.DATA / "fx_rates_cny_per_usd.csv", encoding="utf-8")))
rate_file = "date,cny_per_usd\n" + "".join(f"{r['date']},{r['cny_per_usd']}\n" for r in rates if r["date"] != GAP)

def trim(d):
    keep = ("date", "platform", "platform_label", "type", "ref", "fx_cny", "gross_cny", "platform_fee_cny",
            "payout_fee_cny", "withheld_cny", "net_cny", "issue")
    rows = [{**{k: r.get(k) for k in keep}, "original": {k: r["original"][k] for k in ("currency", "gross")}} for r in d["rows"]]
    return {"complete": d["complete"], "totals": d["totals"], "issues": d["issues"], "rows": rows,
            "rate_sources": d["import"]["rate_sources"], "rates_note": d["import"]["rates_note"]}

client = TestClient(app)
ecb = client.post("/api/personal/ledger", json=body)
fil = client.post("/api/personal/ledger", json={**body, "files": files + [{"name": "my_cny_rates.csv", "content": rate_file}]})
assert ecb.status_code == fil.status_code == 200, (ecb.status_code, fil.status_code)
print("// Kit v1.3.1 · screen 17 data from POST /api/personal/ledger (real backend, in-process), generated 2026-10-17.")
print("// ecb: no rate file, ECB reference rates. file: your rate file without 2026-08-26 (drawn gap). Fictional statements.")
print("window.SA_V131_LEDGER = " + json.dumps({"ecb": trim(ecb.json()), "file": trim(fil.json()), "gap": GAP}, ensure_ascii=False) + ";")
