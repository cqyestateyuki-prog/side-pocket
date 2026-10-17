#!/usr/bin/env python3
"""独立核对：只读 data/ 下的文件，重新计算每个问题的标准答案，和 questions.jsonl 对比。

也可以当作 v2 计算逻辑的参考实现：python3 tools/check_answers.py
"""
import json
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"


def r2(x):
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


creators = {c["creator_id"]: c for c in json.load(open(DATA / "creators.json", encoding="utf-8"))}
assume = json.load(open(DATA / "assumptions.json", encoding="utf-8"))
fx = pd.read_csv(DATA / "fx_rates_cny_per_usd.csv", dtype={"date": str}).set_index("date")["cny_per_usd"].to_dict()

bili = pd.read_csv(DATA / "bilibili_income.csv", encoding="utf-8-sig")
bili["date"] = pd.to_datetime(bili["日期"], format="%Y/%m/%d")
yt = pd.read_csv(DATA / "youtube_revenue.csv")
yt["date"] = pd.to_datetime(yt["Date"], format="%Y-%m-%d")
tw = pd.read_csv(DATA / "twitch_payouts.csv")
tw["date"] = pd.to_datetime(tw["Date"], format="%m/%d/%Y")
pt = pd.read_csv(DATA / "patreon_earnings.csv")
pt["date"] = pd.to_datetime(pt["Month"], format="%b %Y")
uw = pd.read_csv(DATA / "upwork_transactions.csv")
uw["date"] = pd.to_datetime(uw["Date"], format="%b %d, %Y")
uw["rate"] = uw["Service Fee Rate"].str.rstrip("%").astype(float) / 100
fv = pd.read_csv(DATA / "fiverr_earnings.csv")
fv["date"] = pd.to_datetime(fv["Completed At (UTC)"], format="%Y-%m-%dT%H:%M:%SZ")
fl = pd.read_csv(DATA / "freelancer_transactions.csv", dtype={"date": str, "project_id": str})
fl["date"] = pd.to_datetime(fl["date"], format="%Y%m%d")
ct = pd.read_csv(DATA / "contra_payments.csv")
ct["date"] = pd.to_datetime(ct["Paid On"], format="%B %d, %Y")
ct["amount"] = ct["Amount"].str.replace("$", "", regex=False).str.replace(",", "", regex=False).astype(float)
fx2 = pd.read_csv(DATA / "fx_rates_usd_per_unit.csv", dtype={"date": str}).set_index("date")[["EUR", "GBP"]].to_dict("index")

for df in (bili, yt, tw, pt, uw, fv, fl, ct):
    df["month"] = df["date"].dt.strftime("%Y-%m")


class MissingFX(Exception):
    pass


def platform(cid, month, p):
    acct = creators[cid]["accounts"].get(p)
    if acct is None:
        return None
    if p == "bilibili":
        rows = bili[(bili["账号ID"] == acct) & (bili["month"] == month)]
        if rows.empty:
            return None
        out = dict(gross=0.0, platform_fee=0.0, payment_fee=0.0, withheld=0.0, net=0.0,
                   net_cny=rows["实际到账(元)"].sum(), withheld_cny=rows["已代扣个税(元)"].sum())
        for _, r in rows.iterrows():
            key = r["date"].strftime("%Y-%m-%d")
            if key not in fx:
                raise MissingFX(key)
            rate = fx[key]
            out["gross"] += r["流水(元)"] / rate
            out["platform_fee"] += r["平台分成(元)"] / rate
            out["withheld"] += r["已代扣个税(元)"] / rate
            out["net"] += r["实际到账(元)"] / rate
        return out
    if p == "youtube":
        rows = yt[(yt["Channel ID"] == acct) & (yt["month"] == month)]
        if rows.empty:
            return None
        return dict(gross=rows["Gross Revenue (USD)"].sum(), platform_fee=rows["YouTube Share (USD)"].sum(),
                    payment_fee=0.0, withheld=rows["US Tax Withheld (USD)"].sum(),
                    net=rows["Estimated Revenue (USD)"].sum())
    if p == "twitch":
        rows = tw[(tw["Username"] == acct) & (tw["month"] == month)]
        if rows.empty:
            return None
        return dict(gross=rows["Gross (USD)"].sum(), platform_fee=rows["Twitch Share (USD)"].sum(),
                    payment_fee=0.0, withheld=0.0, net=rows["Payout (USD)"].sum())
    if p == "patreon":
        rows = pt[(pt["Creator"] == acct) & (pt["month"] == month)]
        if rows.empty:
            return None
        return dict(gross=rows["Gross Pledges (USD)"].sum(), platform_fee=rows["Patreon Fee (USD)"].sum(),
                    payment_fee=rows["Payment Processing (USD)"].sum(), withheld=0.0,
                    net=rows["Payout (USD)"].sum(), ios=rows["iOS Pledges (USD)"].sum())
    if p == "upwork":
        rows = uw[(uw["Freelancer"] == acct) & (uw["month"] == month)]
        if rows.empty:
            return None
        pays = rows[rows["Type"] != "Withdrawal Fee"]
        fees = sum(r2(a * b) for a, b in zip(pays["Amount (USD)"], pays["rate"]))
        wfee = rows.loc[rows["Type"] == "Withdrawal Fee", "Amount (USD)"].sum()
        gross = pays["Amount (USD)"].sum()
        return dict(gross=gross, platform_fee=fees, payment_fee=wfee, withheld=0.0, net=gross - fees - wfee)
    if p == "fiverr":
        rows = fv[(fv["Seller"] == acct) & (fv["month"] == month)]
        if rows.empty:
            return None
        rate = assume["fiverr_service_fee"]
        pays = rows[rows["Item"] != "Withdrawal Fee"]
        fees = sum(r2(a * rate) for a in pays["Amount (USD)"])
        wfee = rows.loc[rows["Item"] == "Withdrawal Fee", "Amount (USD)"].sum()
        gross = pays["Amount (USD)"].sum()
        return dict(gross=gross, platform_fee=fees, payment_fee=wfee, withheld=0.0, net=gross - fees - wfee,
                    tip_fee=sum(r2(a * rate) for a in pays.loc[pays["Item"] == "Tip", "Amount (USD)"]))
    if p == "freelancer":
        rows = fl[(fl["username"] == acct) & (fl["month"] == month)]
        if rows.empty:
            return None
        out = dict(gross=0.0, platform_fee=0.0, payment_fee=0.0, withheld=0.0, net=0.0)
        for _, r in rows.iterrows():
            amt = r["project_amount"]
            if r["entry_type"] == "Withdrawal Fee":
                out["payment_fee"] += amt
                out["net"] -= amt
                continue
            if r["currency"] == "USD":
                rate = 1.0
            else:
                key = r["date"].strftime("%Y-%m-%d")
                if key not in fx2:
                    raise MissingFX(f"{r['currency']} {key}")
                rate = fx2[key][r["currency"]]
            gross_usd = amt * rate
            fee = fl_fee(gross_usd)  # 10% or $5 on the USD value, rounded to the cent
            out["gross"] += gross_usd
            out["platform_fee"] += fee
            out["net"] += gross_usd - fee
        return out
    if p == "contra":
        rows = ct[(ct["Profile"] == acct) & (ct["month"] == month)]
        if rows.empty:
            return None
        gross = rows["amount"].sum()
        return dict(gross=gross, platform_fee=0.0, payment_fee=0.0, withheld=0.0, net=gross)


def fl_fee(amount):
    return r2(max(amount * assume["freelancer_fee_rate"], assume["freelancer_min_fee"]))


PLATS = ["bilibili", "youtube", "twitch", "patreon", "upwork", "fiverr", "freelancer", "contra"]
LABEL = {"bilibili": "B站", "youtube": "YouTube", "twitch": "Twitch", "patreon": "Patreon", "upwork": "Upwork",
         "fiverr": "Fiverr", "freelancer": "Freelancer.com", "contra": "Contra"}
Q3 = ["2026-07", "2026-08", "2026-09"]


def all_platforms(cid, month):
    return {p: v for p in PLATS if (v := platform(cid, month, p)) is not None}


def total(cid, month, key):
    return sum(v[key] for v in all_platforms(cid, month).values())


# ---- 税表对账：税表口径毛额 = 扣费前每笔收款（正数）之和；退款单独列；交易：每行收款一笔，Patreon 按赞助人数
def months_of(period):
    if "~" in period:
        a, b = period.split("~")
        return [m for m in Q3 if a <= m <= b]
    return [period]


def form_rows(cid, p, months):
    acct = creators[cid]["accounts"].get(p)
    if acct is None:
        return None
    if p == "youtube":
        rows = yt[(yt["Channel ID"] == acct) & (yt["month"].isin(months))]
        g = rows["Gross Revenue (USD)"]
        return dict(gross=g[g > 0].sum(), refunds=-g[g < 0].sum(), txns=int((g > 0).sum()))
    if p == "twitch":
        rows = tw[(tw["Username"] == acct) & (tw["month"].isin(months))]
        return dict(gross=rows["Gross (USD)"].sum(), refunds=0.0, txns=len(rows))
    if p == "patreon":
        rows = pt[(pt["Creator"] == acct) & (pt["month"].isin(months))]
        return dict(gross=rows["Gross Pledges (USD)"].sum(), refunds=0.0, txns=int(rows["Patrons"].sum()))
    if p == "upwork":
        rows = uw[(uw["Freelancer"] == acct) & (uw["month"].isin(months)) & (uw["Type"] != "Withdrawal Fee")]
        return dict(gross=rows["Amount (USD)"].sum(), refunds=0.0, txns=len(rows))
    if p == "fiverr":
        rows = fv[(fv["Seller"] == acct) & (fv["month"].isin(months)) & (fv["Item"] != "Withdrawal Fee")]
        return dict(gross=rows["Amount (USD)"].sum(), refunds=0.0, txns=len(rows))
    if p == "freelancer":
        rows = fl[(fl["username"] == acct) & (fl["month"].isin(months)) & (fl["entry_type"] != "Withdrawal Fee")]
        gross = sum(a * (1.0 if c == "USD" else fx2[d.strftime("%Y-%m-%d")][c])
                    for a, c, d in zip(rows["project_amount"], rows["currency"], rows["date"]))
        return dict(gross=gross, refunds=0.0, txns=len(rows))
    if p == "contra":
        rows = ct[(ct["Profile"] == acct) & (ct["month"].isin(months))]
        return dict(gross=rows["amount"].sum(), refunds=0.0, txns=len(rows))
    raise ValueError(p)


def landed(cid, p, months):
    return sum(v["net"] for m in months if (v := platform(cid, m, p)) is not None)


def projected_over_1099k(cid, p):
    k = assume["form_1099k_threshold"]
    pace = 12 / len(assume["data_coverage_months"])
    f = form_rows(cid, p, assume["data_coverage_months"])
    return f["gross"] * pace > k["gross_usd"] and f["txns"] * pace > k["transactions"]


def answer(q):
    cid, m, cat = q["creator_id"], q["month"], q["category"]
    p = q.get("platform")
    if cat == "total_net_usd":
        return r2(total(cid, m, "net"))
    if cat == "total_gross_usd":
        return r2(total(cid, m, "gross"))
    if cat == "total_platform_fee_usd":
        return r2(total(cid, m, "platform_fee"))
    if cat == "total_payment_fee_usd":
        return r2(total(cid, m, "payment_fee"))
    if cat == "total_withheld_usd":
        return r2(total(cid, m, "withheld"))
    if cat == "platform_net_usd":
        return r2(platform(cid, m, p)["net"])
    if cat == "platform_withheld_usd":
        return r2(platform(cid, m, p)["withheld"])
    if cat == "platform_net_cny":
        return r2(platform(cid, m, p)["net_cny"])
    if cat == "platform_withheld_cny":
        return r2(platform(cid, m, p)["withheld_cny"])
    if cat == "set_aside_usd":
        return r2(total(cid, m, "net") * creators[cid]["set_aside_rate"])
    if cat == "mom_change_usd":
        return r2(total(cid, m, "net") - total(cid, q["compare_to"], "net"))
    if cat == "best_platform":
        ps = all_platforms(cid, m)
        return LABEL[max(ps, key=lambda k: ps[k]["net"] / ps[k]["gross"])]
    if cat == "patreon_ios_impact_usd":
        return r2(platform(cid, m, "patreon")["ios"] * assume["patreon_ios_apple_fee_simulated"])
    if cat == "upwork_contract_fee_usd":
        rows = uw[uw["Contract ID"] == q["contract_id"]]
        return r2(sum(r2(a * b) for a, b in zip(rows["Amount (USD)"], rows["rate"])))
    if cat == "platform_fee_usd":
        return r2(platform(cid, m, p)["platform_fee"])
    if cat == "fiverr_tip_fee_usd":
        return r2(platform(cid, m, "fiverr")["tip_fee"])
    if cat == "freelancer_project_fee_usd":
        row = fl[fl["project_id"] == q["project_id"]].iloc[0]
        assert row["currency"] == "USD"
        return fl_fee(row["project_amount"])
    if cat == "quarter_withheld_usd":
        return r2(sum(total(cid, mm, "withheld") for mm in Q3))
    if cat == "quarter_set_aside_usd":
        return r2(sum(total(cid, mm, "net") for mm in Q3) * creators[cid]["set_aside_rate"])
    if cat == "withholding_platform":
        ps = sorted({k for mm in Q3 for k, v in all_platforms(cid, mm).items() if v["withheld"]})
        assert len(ps) == 1, ps
        return LABEL[ps[0]]
    if cat == "next_estimated_tax_due":
        return next(d for d in assume["us_estimated_tax_due_dates"] if d > q["after_date"])
    if cat == "form_view_gross_usd":
        return r2(form_rows(cid, p, months_of(m))["gross"])
    if cat == "form_gap_usd":
        return r2(form_rows(cid, p, months_of(m))["gross"] - landed(cid, p, months_of(m)))
    if cat == "transaction_count":
        return form_rows(cid, p, months_of(m))["txns"]
    if cat == "threshold_platform_count":
        return sum(projected_over_1099k(cid, k) for k in creators[cid]["accounts"]
                   if assume["tax_forms"][k]["form"] == "1099-K")
    if cat == "duplicate_report_platform":
        methods = creators[cid].get("payout_methods", {})
        ps = [k for k in creators[cid]["accounts"] if methods.get(k) in assume["payout_apps_issuing_1099k"]
              and assume["tax_forms"][k]["form"] != "none"]
        assert len(ps) == 1, ps
        return LABEL[ps[0]]
    raise ValueError(cat)


ok = bad = 0
for line in open(DATA / "questions.jsonl", encoding="utf-8"):
    q = json.loads(line)
    if q["category"] == "alert_missing_fx":
        try:
            if q.get("platform"):
                platform(q["creator_id"], q["month"], q["platform"])
            else:
                total(q["creator_id"], q["month"], "net")
            print(f"{q['id']} FAIL: expected a missing-FX error, got a number")
            bad += 1
        except MissingFX as e:
            ok += 1
        continue
    got = answer(q)
    exp = q["expected_answer"]
    same = got == exp if q["unit"] in ("platform", "date") else abs(got - exp) <= 0.005
    if same:
        ok += 1
    else:
        bad += 1
        print(f"{q['id']} MISMATCH {q['category']}: expected {exp}, checker {got}")

# 结构自检：每行 到手 = 毛收入 - 抽成 - 预扣 等式
row_err = 0
row_err += int(((bili["流水(元)"] - bili["平台分成(元)"] - bili["已代扣个税(元)"] - bili["实际到账(元)"]).abs() > 0.005).sum())
row_err += int(((yt["Gross Revenue (USD)"] - yt["YouTube Share (USD)"] - yt["US Tax Withheld (USD)"] - yt["Estimated Revenue (USD)"]).abs() > 0.005).sum())
row_err += int(((tw["Gross (USD)"] - tw["Twitch Share (USD)"] - tw["Payout (USD)"]).abs() > 0.005).sum())
row_err += int(((pt["Gross Pledges (USD)"] - pt["Patreon Fee (USD)"] - pt["Payment Processing (USD)"] - pt["Payout (USD)"]).abs() > 0.005).sum())
missing_fx_rows = [d for d in bili["date"].dt.strftime("%Y-%m-%d") if d not in fx]
fl_pay = fl[(fl["entry_type"] != "Withdrawal Fee") & (fl["currency"] != "USD")]
missing_fx2 = sorted({(c, d) for c, d in zip(fl_pay["currency"], fl_pay["date"].dt.strftime("%Y-%m-%d")) if d not in fx2})

print(f"\nquestions checked: {ok + bad}, match: {ok}, mismatch: {bad}")
print(f"row arithmetic errors: {row_err}")
print(f"bilibili rows on missing-FX dates: {missing_fx_rows} (owners: {sorted(set(bili.loc[~bili['date'].dt.strftime('%Y-%m-%d').isin(list(fx)), '账号ID']))})")
print(f"freelancer.com non-USD rows on missing-FX dates: {missing_fx2}")
