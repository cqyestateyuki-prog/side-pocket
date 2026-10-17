"""Kit v1.3 mockup data (writes data-v13.js):
    .venv/bin/python "design/Side-Atlas-Design-Kit v1/07-mockups/gen_data_v13.py" --js > "design/Side-Atlas-Design-Kit v1/07-mockups/data-v13.js"
 C01's real ledger re-expressed for 'Your data' screens (read-only use of daoshou)."""
import hashlib, json, sys
from datetime import date
from decimal import Decimal
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3]))  # repo root (design/<kit>/07-mockups/..)
from daoshou import data, ledger as L

c = data.find_creator("C01")
fx = data.fx_rates()
plats = [p for p in L.PLATFORMS if p in c["accounts"]]
LABEL = {**L.LABEL, "bilibili": "Bilibili"}

def pseudo(acct):
    # v1.3.1: four digits of a salted hash, made in the browser before upload (decision #38)
    return "acct ••" + str(int(hashlib.sha256(("side-atlas:" + acct).encode()).hexdigest(), 16) % 10000).zfill(4)

files = []
for p in plats:
    recs = L.records(c, p)
    csv_text = data.export_csv(p, c["accounts"][p])
    miss = L.missing_rates(recs)
    files.append({"platform": p, "label": LABEL[p], "file": data.EXPORTS[p][0], "account": pseudo(c["accounts"][p]),
                  "rows": len(csv_text.strip().splitlines()) - 1, "records": len(recs),
                  "from": min(r.date for r in recs), "to": max(r.date for r in recs),
                  "currencies": sorted({r.currency for r in recs}), "bytes": len(csv_text.encode()),
                  "issues": sum(len(v) for v in miss.values())})

def cny_of(rec):
    """CNY values for one record: CNY stays native; USD × CNY-per-USD on the record's own date."""
    if rec.currency == "CNY":
        return {f: getattr(rec, f) for f in L.FIELDS}, None
    if rec.currency != "USD":
        raise ValueError(rec.currency)
    r = fx.get(rec.date)
    if r is None:
        raise L.MissingFXRate("CNY", [rec.date])
    return {f: getattr(rec, f) * Decimal(str(r)) for f in L.FIELDS}, r

def period(months):
    per, exact = {}, {f: Decimal(0) for f in L.FIELDS}
    ios = Decimal(0)
    for p in plats:
        recs = [x for m in months for x in L.records(c, p, m)]
        if not recs: continue
        t = {f: Decimal(0) for f in L.FIELDS}
        for rec in recs:
            v, r = cny_of(rec)   # raises MissingFXRate: the mockup data must be complete
            for f in L.FIELDS: t[f] += v[f]; exact[f] += v[f]
            if rec.ios: ios += rec.ios * Decimal(str(r))
        per[p] = {"label": LABEL[p], "records": len(recs), **{f: L.cents(t[f]) for f in L.FIELDS},
                  "kept": float(round(t["net"] / t["gross"], 6)) if t["gross"] else None}
    tn = sum((t for t in [exact["net"]]), Decimal(0))
    for p in per.values(): p["share"] = round(p["net"] / float(tn), 6)
    return {"platforms": per, "totals": {f: L.cents(exact[f]) for f in L.FIELDS}, "_exact_net": exact["net"],
            "_exact": exact, "ios_cny": ios}

sep, aug, q3 = period(["2026-09"]), period(["2026-08"]), period(L.months_in("2026-Q3"))
months = {m: period([m])["totals"]["net"] for m in L.months_in("2026-Q3")}
usd_sep = L.month_breakdown(c, "2026-09")["total"]
mom = sep["_exact_net"] - aug["_exact_net"]
bil = q3["platforms"]["bilibili"]
outside_g = q3["_exact"]["gross"] - Decimal(str(bil["gross"]))
outside_n = q3["_exact"]["net"] - Decimal(str(bil["net"]))
patreon_ios_cut = sep["ios_cny"] * Decimal(str(L.assumptions()["patreon_ios_apple_fee_simulated"]))
today = date(2026, 10, 17)
out = {
  "files": files, "records_total": sum(f["records"] for f in files),
  "cny_sep": {"platforms": sep["platforms"], "totals": sep["totals"]},
  "cny_mom": {"change": L.cents(mom), "pct": float(round(mom / Decimal(str(aug["totals"]["net"])), 6))},
  "patreon_ios_sep": {"pledges_cny": L.cents(sep["ios_cny"]), "cut_cny": L.cents(patreon_ios_cut)},
  "cny_q3": {"totals": q3["totals"], "platforms": q3["platforms"], "platforms": q3["platforms"], "bilibili": {k: bil[k] for k in ("gross", "net", "withheld", "records")},
             "outside": {"gross": L.cents(outside_g), "net": L.cents(outside_n), "platforms": len(q3["platforms"]) - 1},
             "set_aside_25": L.cents((Decimal(str(q3["totals"]["net"])) * Decimal("0.25")))},
  "cny_by_month_net": months,
  "usd_sep_net": L.cents(usd_sep["net"]),
  "fx_sep_range": [min(v for k, v in fx.items() if k.startswith("2026-09")), max(v for k, v in fx.items() if k.startswith("2026-09"))],
  "fx_dates": [min(fx), max(fx), len(fx)],
  # dates whose CNY-per-USD rate the CNY view of Q3 uses (USD records only; CNY records stay native)
  "fx_used_q3": len({r.date for p in plats for m in L.months_in("2026-Q3") for r in L.records(c, p, m) if r.currency == "USD"}),
  "cn_window": {"opens": "2027-03-01", "closes": "2027-06-30", "days_to_open": (date(2027,3,1)-today).days,
                "days_to_close": (date(2027,6,30)-today).days},
}
# ---- v1.3.1 · Tax home Both (USD display): China items in USD -------------------------------------------
q3u = {p: {f: Decimal(0) for f in L.FIELDS} for p in plats}
for m in L.months_in("2026-Q3"):
    for p, t in L.month_breakdown(c, m)["platforms"].items():
        for f in L.FIELDS: q3u[p][f] += t["usd"][f]
tot_u = {f: sum((q3u[p][f] for p in plats), Decimal(0)) for f in L.FIELDS}
both = {"bilibili_usd": {f: L.cents(q3u["bilibili"][f]) for f in L.FIELDS},
        "outside_usd": {f: L.cents(tot_u[f] - q3u["bilibili"][f]) for f in L.FIELDS},
        "us_due": {"date": "2027-01-15", "days": (date(2027, 1, 15) - today).days}}
out["both"] = both

if "--js" in sys.argv:
    print("// Kit v1.3 · real numbers from daoshou/ledger.py (read-only), fictional test data, generated 2026-10-17.")
    print("// 'Your data' screens re-use creator C01's exports as if the person uploaded them. CNY view: CNY records")
    print("// stay native, USD records x that day's CNY-per-USD rate, summed unrounded, rounded half-up once.")
    print("window.SA_V13 = " + json.dumps(out, ensure_ascii=False) + ";")
else:
    print(json.dumps(out, ensure_ascii=False, indent=1))
