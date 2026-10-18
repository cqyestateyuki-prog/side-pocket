"""Kit v1.4 data (writes data-v14.js): all side income for the person ("You"), July to September 2026.

    .venv/bin/python "design/Side-Atlas-Design-Kit v1/07-mockups/gen_data_v14.py" > "design/Side-Atlas-Design-Kit v1/07-mockups/data-v14.js"

Inputs: creator C01's statement exports, relabelled as the browser does, plus the demo rate tables uploaded as
the person's rate files (so every rate is "your rate file", as on screens 13 and 14), and C01's manual
entries from daoshou_testdata/data/manual_entries.json.
Code: everything comes from the real endpoints in-process, with the entries and the $6,000 goal in the body:
POST /api/personal/overview (income_by_source, expenses_by_category, kept_after_expenses, goal, badges) and
POST /api/personal/ledger (rows + entry_rows). Only the "as of Sep 15" goal sample calls rewards.goal_progress
directly, on events built from those endpoint rows.
"""
import csv, hashlib, io, json, sys
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
from fastapi.testclient import TestClient  # noqa: E402
from api.main import app  # noqa: E402
from daoshou import data, rewards  # noqa: E402

MONTHS, SHOW, GOAL_MONTHS = ["2026-07", "2026-08", "2026-09"], "2026-09", ["2026-07", "2026-08", "2026-09"]
LABEL = {"bilibili": "Bilibili", "youtube": "YouTube", "twitch": "Twitch", "patreon": "Patreon", "upwork": "Upwork",
         "fiverr": "Fiverr", "freelancer": "Freelancer.com", "contra": "Contra"}
c = data.find_creator("C01")
fixture = json.loads((data.DATA / "manual_entries.json").read_text(encoding="utf-8"))["creators"]["C01"]
c2 = lambda x: float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))

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
for name in ("fx_rates_cny_per_usd.csv", "fx_rates_usd_per_unit.csv"):
    files.append({"name": name, "content": (data.DATA / name).read_text(encoding="utf-8")})
client = TestClient(app)
def post(path, **kw):
    r = client.post(f"/api/personal/{path}", json={"files": files, "tax_home": "US", "currency": "USD", "set_aside_rate": 0.25,
                                                    "after": "2026-10-17", "payout_methods": c.get("payout_methods", {}), **kw})
    assert r.status_code == 200, (path, r.status_code, r.text[:300])
    return r.json()
body_extra = {"entries": fixture["entries"], "monthly_goal": fixture["monthly_goal"]}
ovs = {m: post("overview", month=m, **body_extra) for m in MONTHS}
ledgers = {m: post("ledger", month=m, **body_extra) for m in MONTHS}
assert all(o["complete"] for o in ovs.values()) and all(l["complete"] for l in ledgers.values())
D2 = lambda x: Decimal(str(x))

def income_net(o):  # platform net plus manual income, before expenses (the goal and badge basis)
    k = o["kept_after_expenses"]; return D2(k["platform_net"]) + D2(k["manual_income"])
def overview(m):
    o, i = ovs[m], MONTHS.index(m)
    prev = MONTHS[i - 1] if i else None
    net = income_net(o)
    ch = net - income_net(ovs[prev]) if prev else None
    sources = [{"key": x["platform"] or "own:" + x["source"].lower(), "label": LABEL.get(x["platform"], x["source"]), "own": x["manual"],
                "net": x["income"]} for x in o["income_by_source"]]
    cats = [{"category": x["category"], "amount": x["amount"], "count": x["entries"]} for x in o["expenses_by_category"] if x["amount"]]
    return {"month": m, "prev_month": prev,
            "income": {"net": c2(net), "gross": c2(D2(o["totals"]["gross"]) + D2(o["manual_income"]["total"])), "sources": sources,
                       "mom": {"change": c2(ch), "pct": float(round(ch / income_net(ovs[prev]), 6))} if prev else None},
            "expenses": {"total": o["expenses"]["total"], "count": o["expenses"]["entries"], "by_category": sorted(cats, key=lambda x: -x["amount"])},
            "kept": o["kept_after_expenses"]["kept"]}
goal = {**ovs[SHOW]["goal"], "months": [ovs[m]["goal"]["months"][0] for m in MONTHS]}  # each month from its own overview
goal["months_reached"] = sum(x["reached"] for x in goal["months"])
badges = {m: ovs[m]["badges"] for m in MONTHS}

# the in-progress goal state as it looked on Sep 15: rewards.goal_progress on events from the endpoint rows up to that day
MID = "2026-09-15"
ev = [rewards.Event(r["date"], "income", r["platform_label"], r["platform"], r["original"]["currency"], r["original"]["gross"] > 0, D2(r["net_usd"]), None)
      for r in ledgers[SHOW]["rows"] if r["date"] <= MID]
ev += [rewards.Event(r["date"], r["kind"], r["source"] or r["category"], None, r["original"]["currency"], True,
                     D2(r["amount_usd"]) * (1 if r["kind"] == "income" else -1), None) for r in ledgers[SHOW]["entry_rows"] if r["date"] <= MID]
goal_mid = rewards.goal_progress(ev, [SHOW], D2(fixture["monthly_goal"]["amount"]), "USD")["months"][0] | {"as_of": MID}

# Ledger for the shown month: statement rows, your income and your expenses, by date
L = ledgers[SHOW]; rows = []
for r in L["rows"]:
    rows.append({"date": r["date"], "kind": "statement", "key": r["platform"], "label": LABEL[r["platform"]], "type": r["type"], "ref": r["ref"],
                 "original": {"currency": r["original"]["currency"], "amount": r["original"]["gross"]},
                 "fx_line": f"÷ {r['fx']['rate']:.4f} · {r['fx']['rate_date']}" if r.get("fx") else "",
                 "gross": r["gross_usd"], "fees": c2(D2(r["platform_fee_usd"]) + D2(r["payout_fee_usd"])), "withheld": r["withheld_usd"], "net": r["net_usd"]})
for e in L["entry_rows"]:
    fx = e.get("fx")
    row = {"date": e["date"], "kind": e["kind"], "key": "own", "label": e["source"] if e["kind"] == "income" else e["category"],
           "type": "Income" if e["kind"] == "income" else "Expense", "ref": None if e["kind"] == "income" else e["source"],
           "original": {"currency": e["original"]["currency"], "amount": e["original"]["amount"]},
           "fx_line": (f"÷ {fx['rate']:.4f} · {fx['rate_date']}" if e["original"]["currency"] == "CNY" else f"× {fx['rate']:.4f} · {fx['rate_date']}") if fx else ""}
    if e["kind"] == "income": row.update(gross=e["amount_usd"], fees=0, withheld=0, net=e["amount_usd"])
    else: row.update(amount_usd=e["amount_usd"])
    rows.append(row)
rows.sort(key=lambda r: (r["date"], {"statement": 0, "income": 1, "expense": 2}[r["kind"]], r["label"]))
k = L["kept_after_expenses"]
ledger = {"rows": rows, "counts": {"all": len(rows), "income": sum(r["kind"] != "expense" for r in rows), "expenses": sum(r["kind"] == "expense" for r in rows),
                                   "own": sum(r["kind"] != "statement" for r in rows)},
          "totals": {"gross": c2(D2(L["totals"]["gross"]) + D2(L["manual_income"]["total"])), "fees": c2(D2(L["totals"]["platform_fee"]) + D2(L["totals"]["payout_fee"])),
                     "withheld": L["totals"]["withheld"], "expenses": L["expenses"]["total"], "net": c2(D2(k["platform_net"]) + D2(k["manual_income"])),
                     "kept": k["kept"], "net_after_expenses": k["kept"]}}
entries = fixture["entries"]
last = lambda kind: max((e for e in entries if e["kind"] == kind and e["date"][:7] == SHOW), key=lambda e: e["date"])
xe, xi = last("expense"), last("income")
# Badge art: Atlas v2 poses (design/mascots/atlas_v2, picks from make.py's PICKS) copied into the kit when they exist;
# otherwise the v1 moods, and the kit says so.
import re, shutil
ART = {"first_1k_month": "coin", "best_month": "trophy", "growth_streak_3": "coin-stack", "new_source": "envelope",
       "five_sources": "star-badge", "new_currency": "globe", "total_10k": "medal", "complete_month": "ledger", "goal": "flag"}
FALLBACK = {"goal": "celebrate", "growth_streak_3": "think"}
v2 = ROOT / "design" / "mascots" / "atlas_v2"
picks = {}
m_ = re.search(r"PICKS(?::[^=\n]*)?\s*=\s*(\{[^}]*\})", (v2 / "make.py").read_text(encoding="utf-8")) if (v2 / "make.py").exists() else None
if m_:
    picks = eval(m_.group(1), {})  # a literal dict of pose -> candidate
kit = Path(__file__).resolve().parents[1] / "02-logos" / "mascot"
art = {}
for k, pose in ART.items():
    src = v2 / "png" / f"{pose}-{picks.get(pose, 'a')}.png"
    if src.exists():
        (kit / "v2").mkdir(exist_ok=True); shutil.copyfile(src, kit / "v2" / f"{pose}.png")
        art[k] = f"../02-logos/mascot/v2/{pose}.png"
    else:
        art[k] = f"../02-logos/mascot/{FALLBACK.get(k, 'celebrate')}.png"
art_v2 = sum(a.startswith("../02-logos/mascot/v2/") for a in art.values())

out = {"art": art, "art_v2": art_v2, "goal_mid": goal_mid, "months": {m: overview(m) for m in MONTHS}, "show": SHOW, "goal": goal, "badges": badges, "ledger": ledger,
       "own_sources": sorted({e["source"] for e in entries if e["kind"] == "income"}),
       "entry_examples": {"expense": {k: xe[k] for k in ("date", "amount", "currency", "category", "source")},
                          "income": {k: xi[k] for k in ("date", "amount", "currency", "source")}},
       "goal_presets": [4000, 5000, 6000, 7000]}
if "--js" in sys.argv:
    print("// Kit v1.4 · generated by gen_data_v14.py from the real endpoints in-process (POST /api/personal/overview and /ledger with")
    print("// the manual entries and the goal from daoshou_testdata/data/manual_entries.json). Fictional data.")
    print("window.SA_V14_RAW = " + json.dumps(out, ensure_ascii=False, default=float) + ";")
else:
    print(json.dumps({"months": {m: {k: v for k, v in o.items() if k != "income"} | {"net": o["income"]["net"]} for m, o in out["months"].items()},
                      "goal": goal, "badges": badges, "counts": ledger["counts"], "totals": ledger["totals"]}, indent=1, default=float))
