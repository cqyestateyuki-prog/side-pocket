#!/usr/bin/env python3
"""到手 Daoshou 测试数据生成器

全部为虚构数据，仅用于 MONEY TALKS 2 黑客松 demo。
运行：python3 tools/generate_testdata.py
输出：data/ 下的 8 个平台 CSV、两张汇率表、创作者档案、假设值、标准答案和问题集。
同一个随机种子每次生成的数据完全一样。
"""
import csv
import json
import random
import datetime as dt
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

SEED = 20261017
random.seed(SEED)

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DATA.mkdir(parents=True, exist_ok=True)

MONTHS = ["2026-07", "2026-08", "2026-09"]
MISSING_FX_DATE = "2026-09-07"  # 故意缺失，只有 C09 的一条记录会用到，用来触发告警
MISSING_FX2_DATE = "2026-08-21"  # 欧元/英镑汇率表故意缺这一天，只有 C11 的一个欧元项目落在这天
ORIG_PLATFORMS = ["bilibili", "youtube", "twitch", "patreon", "upwork"]
NEW_PLATFORMS = ["fiverr", "freelancer", "contra"]
PLATFORMS = ORIG_PLATFORMS + NEW_PLATFORMS
PLATFORM_LABEL = {"bilibili": "B站", "youtube": "YouTube", "twitch": "Twitch",
                  "patreon": "Patreon", "upwork": "Upwork", "fiverr": "Fiverr",
                  "freelancer": "Freelancer.com", "contra": "Contra"}
# IRS 2026 纳税年度的季度预估税截止日（真实日期）
US_ESTIMATED_TAX_DUE = ["2026-04-15", "2026-06-15", "2026-09-15", "2027-01-15"]

ASSUMPTIONS = {
    "note": "全部为模拟假设值，仅用于黑客松 demo，真实费率以平台官方规则为准",
    "fx_unit": "1 美元 = X 人民币（CNY per USD）",
    "fx_rule": "每笔人民币记录按它自己日期当天的汇率换算成美元：USD = CNY / 汇率",
    "bilibili_platform_share": 0.50,
    "bilibili_withholding_rule": "模拟：当月(流水-分成)×80% − 5000，正数部分 ×3%，在月末记一条“提现代扣个税”",
    "youtube_platform_share": 0.30,
    "youtube_us_withholding": "部分非美国创作者有美国预扣税，金额直接写在数据里",
    "twitch_platform_share": {"Subscriptions": 0.50, "Ad Revenue": 0.45, "Bits": 0.0},
    "patreon_platform_fee": 0.08,
    "patreon_payment_processing": 0.03,
    "patreon_ios_apple_fee_simulated": 0.30,
    "upwork_service_fee": "每个合同自己的费率，见 upwork 文件的 Service Fee Rate 列；每笔服务费 = 金额 × 费率，四舍五入到分",
    "upwork_withdrawal_fee_usd": 2.00,
    "rounding": "所有金额四舍五入（ROUND_HALF_UP）到 0.01；换算过程保留全部精度，最后才四舍五入",
    "set_aside_rule": "应预留税金 = 当月总到手（美元）× 创作者自己设定的预留比例",
    "fiverr_service_fee": 0.20,
    "fiverr_service_fee_note": "真实规则：订单、小费（Tip）、加购（Extra）一律抽 20%；每笔费用先四舍五入到分再加总",
    "fiverr_withdrawal_fee_usd": 3.00,
    "fiverr_withdrawal_fee_note": "模拟：每次提现收 $3",
    "freelancer_fee_rate": 0.10,
    "freelancer_min_fee": 5.00,
    "freelancer_fee_note": "真实规则：固定价项目抽项目金额的 10% 或 $5，取较高者；非美元项目先按当天汇率换成美元再算；每个项目的费用按美元四舍五入到分",
    "freelancer_withdrawal_fee_usd": 1.00,
    "freelancer_withdrawal_fee_note": "模拟：每次提现收 $1",
    "contra_fee": 0.0,
    "contra_note": "真实规则：自由职业者 0% 抽成；模拟：提现不收手续费",
    "fx2_unit": "1 欧元 / 1 英镑 = X 美元（USD per unit），方向和人民币那张表相反",
    "fx2_rule": "每笔欧元/英镑记录按它自己日期当天的汇率换算：USD = 金额 × 汇率；先换算再加总，最后才四舍五入",
    "us_estimated_tax_due_dates": US_ESTIMATED_TAX_DUE,
    "us_estimated_tax_note": "IRS 2026 纳税年度季度预估税截止日（真实）",
    "quarter_set_aside_rule": "季度应预留 = 季度内各月总到手（美元，不先四舍五入）之和 × 预留比例",
    # ---- 税表对账（Q082 起）
    "tax_forms_note": "模拟：各平台给美国税务居民开哪种税表、由谁开，都是示例，请以平台和 IRS 为准；只有 1099-K 门槛是真实规则",
    "tax_forms": {
        "bilibili": {"form": "none", "issuer": "—",
                     "note": "模拟：中国平台不开美国税表；已代扣的个税可在个人所得税 App 查纳税记录，交给会计"},
        "youtube": {"form": "1099-MISC", "issuer": "Google (AdSense)", "note": "模拟，以平台为准"},
        "twitch": {"form": "1099-MISC", "issuer": "Twitch", "note": "模拟，以平台为准"},
        "patreon": {"form": "1099-K", "issuer": "Patreon", "note": "模拟，以平台为准"},
        "upwork": {"form": "1099-K", "issuer": "Upwork", "note": "模拟，以平台为准"},
        "fiverr": {"form": "1099-K", "issuer": "Fiverr", "note": "模拟，以平台为准"},
        "freelancer": {"form": "1099-K", "issuer": "Freelancer.com", "note": "模拟，以平台为准"},
        "contra": {"form": "1099-K", "issuer": "Contra's payment processor", "note": "模拟，以平台为准"},
    },
    "form_1099k_threshold": {
        "gross_usd": 20000, "transactions": 200,
        "rule": "真实规则：第三方结算机构（TPSO）一个日历年里付给同一收款人的总额超过 $20,000 且交易超过 200 笔，才必须开 1099-K（2025 年的法律把门槛恢复成这样）",
    },
    "form_1099misc_threshold_usd": 2000,
    "form_1099misc_note": "模拟：示例用 $2,000 作为 1099-MISC/NEC 的开表门槛，以 IRS 为准",
    "form_view_rule": "税表口径毛额 = 扣平台费、提现费、预扣税之前的每笔收款（正数）之和，换成美元；退款不从税表毛额里减，单独列出",
    "form_gap_rule": "税表口径毛额 − 实际到手 = 平台抽成 + 提现/支付费 + 平台预扣税 + 退款",
    "transaction_count_rule": "模拟口径：每一行收款记一笔交易（Fiverr 的订单、加购、小费各算一笔）；Patreon 按当月赞助人数计；退款和提现费不算交易",
    "data_coverage_months": MONTHS,
    "form_projection_rule": "门槛按日历年看。数据只有 2026 年 7–9 月，所以'今年到目前'只算这三个月；'按目前速度推算全年' = 7–9 月 × 4，这是推算不是实际",
    "payout_apps_issuing_1099k": ["PayPal"],
    "payout_method_default": "Bank transfer",
    "duplicate_report_note": "模拟：如果平台把钱打到 PayPal 这类自己也会开 1099-K 的付款账户，同一笔收入可能被平台和 PayPal 各报一次；报税时不要重复计入，带上这份对账给会计",
    "income_reportable_note": "即使没有收到任何税表，这些收入一样要报税",
}

# ---------------------------------------------------------------- helpers

def r2(x):
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def month_bounds(month):
    y, m = map(int, month.split("-"))
    first = dt.date(y, m, 1)
    nxt = dt.date(y + (m == 12), m % 12 + 1, 1)
    return first, nxt - dt.timedelta(days=1)


def rand_date(month):
    """当月 1 号到倒数第二天之间的随机日期，避开缺汇率的那天。"""
    _, last = month_bounds(month)
    while True:
        d = dt.date(last.year, last.month, random.randint(1, last.day - 1))
        if d.isoformat() != MISSING_FX_DATE:
            return d


def month_label(month):
    first, _ = month_bounds(month)
    return first.strftime("%b %Y")  # Jul 2026


def upwork_date(d):
    return f"{d:%b} {d.day}, {d.year}"  # Sep 5, 2026


# ---------------------------------------------------------------- FX table

fx = {}
rate = 7.150
d = dt.date(2026, 7, 1)
while d <= dt.date(2026, 9, 30):
    rate = min(max(rate + random.uniform(-0.012, 0.012), 7.08), 7.22)
    if d.isoformat() != MISSING_FX_DATE:
        fx[d.isoformat()] = round(rate, 4)
    d += dt.timedelta(days=1)

# ---------------------------------------------------------------- creators

CREATORS = [
    dict(creator_id="C01", name="月之灵",
         profile="纽约的设计师，副业在全球平台接设计单（Upwork、Fiverr、Contra）并做内容（YouTube、Twitch、Patreon、B 站）（demo 主角）",
         tax_country="US", set_aside_rate=0.25, active_months=MONTHS,
         accounts=dict(bilibili="bili_330121", youtube="UC-yzl-moonspirit", twitch="yuezhiling_tv",
                       patreon="yuezhiling", upwork="moonspirit_design", fiverr="moonspirit_studio",
                       contra="moonspirit"),
         payout_methods=dict(fiverr="PayPal")),
    dict(creator_id="C02", name="小鹿", profile="只在 B 站直播的中文主播",
         tax_country="CN", set_aside_rate=0.0, active_months=MONTHS,
         accounts=dict(bilibili="bili_552047")),
    dict(creator_id="C03", name="Maya Chen", profile="只用美国平台的游戏主播",
         tax_country="US", set_aside_rate=0.30, active_months=MONTHS,
         accounts=dict(youtube="UC-mayachen-plays", twitch="mayachenplays", patreon="mayachen"),
         payout_methods=dict(patreon="PayPal")),
    dict(creator_id="C04", name="阿柚", profile="中英双平台 VTuber，YouTube 有美国预扣税",
         tax_country="CN", set_aside_rate=0.10, active_months=MONTHS,
         accounts=dict(bilibili="bili_771390", youtube="UC-ayou-vt")),
    dict(creator_id="C05", name="Leo Park", profile="主播，9 月有一笔 Super Chat 退款",
         tax_country="US", set_aside_rate=0.28, active_months=MONTHS,
         accounts=dict(youtube="UC-leopark-live", twitch="leoparklive")),
    dict(creator_id="C06", name="Nina Rossi", profile="Upwork 自由设计师，5 个合同抽成各不相同",
         tax_country="US", set_aside_rate=0.28, active_months=MONTHS,
         accounts=dict(upwork="nina_rossi_studio")),
    dict(creator_id="C07", name="墨白", profile="画师主播，8 月有一笔总督大额收入，Patreon iOS 订阅占比高",
         tax_country="CA", set_aside_rate=0.20, active_months=MONTHS,
         accounts=dict(bilibili="bili_908163", patreon="mobai_art")),
    dict(creator_id="C08", name="Sam Ito", profile="创作者兼自由职业者，8 月没有任何收入，YouTube 有美国预扣税",
         tax_country="JP", set_aside_rate=0.15, active_months=["2026-07", "2026-09"],
         accounts=dict(youtube="UC-samito-makes", patreon="samitomakes", upwork="sam_ito_dev")),
    dict(creator_id="C09", name="Kiki", profile="告警测试用户：9 月有一条 B 站记录落在缺汇率的日期",
         tax_country="US", set_aside_rate=0.25, active_months=["2026-09"],
         accounts=dict(bilibili="bili_123987")),
    dict(creator_id="C10", name="Diego Alvarez",
         profile="插画师，在 Fiverr 接单（小费和加购多），也在 Freelancer.com 接小项目（会触发 $5 最低服务费）",
         tax_country="US", set_aside_rate=0.22, active_months=MONTHS,
         accounts=dict(fiverr="diegodraws", freelancer="diego_alv")),
    dict(creator_id="C11", name="Lena Koch",
         profile="柏林的 UI 设计师，Freelancer.com 接欧元/英镑项目，也用 Contra；8 月有一个欧元项目落在缺汇率的日期（告警测试）",
         tax_country="DE", set_aside_rate=0.30, active_months=MONTHS,
         accounts=dict(freelancer="lenakoch_ui", contra="lenakoch")),
    dict(creator_id="C12", name="Priya Nair",
         profile="纽约的 logo 设计师，Fiverr 单量很大（7–9 月已超过 1099-K 门槛），Fiverr 的钱提现到 PayPal；也用 Contra（税表对账测试）",
         tax_country="US", set_aside_rate=0.27, active_months=MONTHS,
         accounts=dict(fiverr="priyanair_studio", contra="priyanair"),
         payout_methods=dict(fiverr="PayPal")),
]
BY_ID = {c["creator_id"]: c for c in CREATORS}
RNG3_CREATORS = {"C12"}  # 用第三条随机数流生成，前面所有数据保持不变

# 生成参数（不写进创作者档案）
BILI_SCALE = {"C01": 4.0, "C02": 0.6, "C04": 0.8, "C07": 1.2, "C09": 0.5}
YT_SCALE = {"C01": 1.0, "C03": 2.0, "C04": 0.7, "C05": 1.5, "C08": 0.8}
YT_WITHHOLD = {"C04": 0.04, "C08": 0.09}  # 有效预扣率（模拟）
TW_SCALE = {"C01": 0.8, "C03": 2.0, "C05": 1.5}
PATREON = {"C01": ((500, 900), 0.35), "C03": ((800, 1500), 0.25),
           "C07": ((1000, 1800), 0.65), "C08": ((200, 400), 0.30)}
UPWORK_CONTRACTS = {
    "C01": [("UW-2101", "Lumen Studio", 0.10, "Fixed Price", (300, 900)),
            ("UW-2102", "Hollow Pine Games", 0.15, "Hourly", (200, 600))],
    "C06": [("UW-3101", "Brightfield Co", 0.15, "Fixed Price", (400, 1500)),
            ("UW-3102", "Atlas Kitchen", 0.10, "Hourly", (300, 900)),
            ("UW-3103", "Northwind Apparel", 0.05, "Hourly", (500, 1200)),
            ("UW-3104", "Pixel Harbor", 0.0, "Fixed Price", (250, 800)),
            ("UW-3105", "Mori Tea", 0.12, "Fixed Price", (300, 1000))],
    "C08": [("UW-4101", "Kumo Labs", 0.10, "Hourly", (400, 1100))],
}

# ---------------------------------------------------------------- B站

bili_rows = []
BILI_TYPES = ["充电", "舰长", "提督", "SC", "礼物"]
BILI_WEIGHTS = [0.30, 0.15, 0.03, 0.27, 0.25]
for c in CREATORS:
    cid = c["creator_id"]
    if "bilibili" not in c["accounts"]:
        continue
    acct = c["accounts"]["bilibili"]
    s = BILI_SCALE[cid]
    for month in c["active_months"]:
        rows = []
        n = 3 if cid == "C09" else (random.randint(10, 14) if cid == "C01" else random.randint(5, 9))
        for i in range(n):
            t = random.choices(BILI_TYPES, BILI_WEIGHTS)[0]
            if t == "舰长":
                amt = 198
            elif t == "提督":
                amt = 1998
            elif t == "充电":
                amt = int(random.randint(30, 600) * s)
            elif t == "SC":
                amt = int(random.randint(30, 500) * s)
            else:
                amt = int(random.randint(10, 800) * s)
            d = rand_date(month)
            if cid == "C09" and i == 0:
                d = dt.date.fromisoformat(MISSING_FX_DATE)  # 告警触发点
            rows.append([d, t, amt, ""])
        if cid == "C01":
            rows.append([rand_date(month), "提督", 1998, ""])  # 月之灵每月固定有一位提督，保证 demo 里能看到代扣个税
        if cid == "C07" and month == "2026-08":
            rows.append([dt.date(2026, 8, 16), "总督", 19998, "大额单笔"])
        rows.sort(key=lambda r: r[0])
        net_cny = 0.0
        for d, t, amt, note in rows:
            share = r2(amt * ASSUMPTIONS["bilibili_platform_share"])
            net = r2(amt - share)
            net_cny += net
            bili_rows.append(dict(acct=acct, date=d, type=t, gross=float(amt), share=share,
                                  tax=0.0, net=net, note=note))
        tax = r2(max(0.0, net_cny * 0.8 - 5000) * 0.03)
        if tax > 0:
            _, last = month_bounds(month)
            bili_rows.append(dict(acct=acct, date=last, type="提现代扣个税", gross=0.0, share=0.0,
                                  tax=tax, net=-tax, note="平台代扣代缴"))

# ---------------------------------------------------------------- YouTube

yt_rows = []
for c in CREATORS:
    cid = c["creator_id"]
    if "youtube" not in c["accounts"]:
        continue
    acct = c["accounts"]["youtube"]
    s = YT_SCALE[cid]
    wh = YT_WITHHOLD.get(cid, 0.0)
    for month in c["active_months"]:
        items = []
        for _ in range(random.randint(2, 5)):
            items.append(("Super Chat", r2(random.uniform(20, 300) * s)))
        for _ in range(random.randint(0, 2)):
            items.append(("Super Sticker", r2(random.uniform(5, 60) * s)))
        items.append(("Channel Memberships", r2(random.uniform(100, 600) * s)))
        recs = []
        for t, gross in items:
            d = dt.date(2026, int(month[-2:]), 28) if t == "Channel Memberships" else rand_date(month)
            share = r2(gross * ASSUMPTIONS["youtube_platform_share"])
            withheld = r2((gross - share) * wh)
            recs.append(dict(acct=acct, date=d, type=t, gross=gross, share=share,
                             withheld=withheld, net=r2(gross - share - withheld)))
        if cid == "C05" and month == "2026-09":
            recs.append(dict(acct=acct, date=dt.date(2026, 9, 19), type="Super Chat Refund",
                             gross=-120.00, share=-36.00, withheld=0.0, net=-84.00))
        recs.sort(key=lambda r: r["date"])
        yt_rows.extend(recs)

# ---------------------------------------------------------------- Twitch

tw_rows = []
for c in CREATORS:
    cid = c["creator_id"]
    if "twitch" not in c["accounts"]:
        continue
    acct = c["accounts"]["twitch"]
    s = TW_SCALE[cid]
    for month in c["active_months"]:
        items = [("Subscriptions", r2(random.uniform(100, 800) * s))]
        for _ in range(random.randint(1, 3)):
            items.append(("Bits", r2(random.uniform(10, 150) * s)))
        items.append(("Ad Revenue", r2(random.uniform(20, 120) * s)))
        recs = []
        for t, gross in items:
            d = dt.date(2026, int(month[-2:]), 15) if t == "Subscriptions" else rand_date(month)
            share = r2(gross * ASSUMPTIONS["twitch_platform_share"][t])
            recs.append(dict(acct=acct, date=d, type=t, gross=gross, share=share,
                             payout=r2(gross - share)))
        recs.sort(key=lambda r: r["date"])
        tw_rows.extend(recs)

# ---------------------------------------------------------------- Patreon

pt_rows = []
for c in CREATORS:
    cid = c["creator_id"]
    if "patreon" not in c["accounts"]:
        continue
    acct = c["accounts"]["patreon"]
    (lo, hi), ios_pct = PATREON[cid]
    for month in c["active_months"]:
        gross = r2(random.uniform(lo, hi))
        ios = r2(gross * min(0.9, max(0.05, ios_pct + random.uniform(-0.05, 0.05))))
        fee = r2(gross * ASSUMPTIONS["patreon_platform_fee"])
        proc = r2(gross * ASSUMPTIONS["patreon_payment_processing"])
        pt_rows.append(dict(acct=acct, month=month, patrons=int(gross / random.uniform(6, 9)),
                            gross=gross, ios=ios, fee=fee, proc=proc, payout=r2(gross - fee - proc)))

# ---------------------------------------------------------------- Upwork

uw_rows = []
for c in CREATORS:
    cid = c["creator_id"]
    if "upwork" not in c["accounts"]:
        continue
    acct = c["accounts"]["upwork"]
    contracts = UPWORK_CONTRACTS[cid]
    paid = set()
    for mi, month in enumerate(c["active_months"]):
        recs = []
        for k, (cno, client, fee_rate, kind, (lo, hi)) in enumerate(contracts):
            last_month = mi == len(c["active_months"]) - 1
            must_pay = last_month and cno not in paid
            if must_pay or random.random() < 0.75:
                n_pay = 2 if kind == "Hourly" and random.random() < 0.5 else 1
                for _ in range(n_pay):
                    recs.append(dict(acct=acct, date=rand_date(month), type=kind, contract=cno,
                                     client=client, amount=r2(random.uniform(lo, hi)), rate=fee_rate))
                paid.add(cno)
        if recs:
            _, last = month_bounds(month)
            wd = min(max(r["date"] for r in recs) + dt.timedelta(days=2), last)
            if wd.isoformat() == MISSING_FX_DATE:
                wd += dt.timedelta(days=1)
            recs.append(dict(acct=acct, date=wd, type="Withdrawal Fee", contract="", client="",
                             amount=ASSUMPTIONS["upwork_withdrawal_fee_usd"], rate=None))
        recs.sort(key=lambda r: r["date"])
        uw_rows.extend(recs)

# ---------------------------------------------------------------- 新平台：Fiverr、Freelancer.com、Contra
# 用单独的一条随机数流，原有 5 个平台的数据保持不变

rng2 = random.Random(SEED + 101)


def rand_date2(month):
    _, last = month_bounds(month)
    while True:
        d = dt.date(last.year, last.month, rng2.randint(1, last.day - 1))
        if d.isoformat() not in (MISSING_FX_DATE, MISSING_FX2_DATE):
            return d


# 欧元/英镑汇率表：1 单位外币 = X 美元，故意缺 MISSING_FX2_DATE 这一天
fx2 = {}
eur, gbp = 1.115, 1.305
d = dt.date(2026, 7, 1)
while d <= dt.date(2026, 9, 30):
    eur = min(max(eur + rng2.uniform(-0.004, 0.004), 1.08), 1.15)
    gbp = min(max(gbp + rng2.uniform(-0.005, 0.005), 1.26), 1.35)
    if d.isoformat() != MISSING_FX2_DATE:
        fx2[d.isoformat()] = {"EUR": round(eur, 4), "GBP": round(gbp, 4)}
    d += dt.timedelta(days=1)

FIVERR = {"C01": ((60, 260), (2, 4)), "C10": ((40, 180), (4, 6))}  # 订单金额范围、每月订单数
FIVERR_BUYERS = ["kaito_k", "jessmakes", "brightloop", "olive.design", "marco_r", "tinyforge", "nordbyte"]
fv_rows = []
for c in CREATORS:
    cid = c["creator_id"]
    if "fiverr" not in c["accounts"] or cid in RNG3_CREATORS:
        continue
    acct = c["accounts"]["fiverr"]
    (lo, hi), (nlo, nhi) = FIVERR[cid]
    for month in c["active_months"]:
        recs = []
        for _ in range(rng2.randint(nlo, nhi)):
            base = dict(acct=acct, date=rand_date2(month), hour=rng2.randint(0, 23), minute=rng2.randint(0, 59),
                        order=f"FO{rng2.randint(100000, 999999)}", buyer=rng2.choice(FIVERR_BUYERS))
            recs.append(dict(base, item="Order", amount=r2(rng2.uniform(lo, hi))))
            if rng2.random() < 0.4:
                recs.append(dict(base, item="Extra", amount=r2(rng2.uniform(10, 60))))
            if rng2.random() < 0.5:
                recs.append(dict(base, item="Tip", amount=r2(rng2.uniform(5, 40))))
        if not any(r["item"] == "Tip" for r in recs):  # 每月至少一笔小费，保证"小费也抽 20%"能测到
            first = next(r for r in recs if r["item"] == "Order")
            recs.append(dict(first, item="Tip", amount=r2(rng2.uniform(5, 40))))
        _, last = month_bounds(month)
        wd = min(max(r["date"] for r in recs) + dt.timedelta(days=3), last)
        recs.append(dict(acct=acct, date=wd, hour=9, minute=0, order="", buyer="", item="Withdrawal Fee",
                         amount=ASSUMPTIONS["fiverr_withdrawal_fee_usd"]))
        recs.sort(key=lambda r: (r["date"], r["hour"], r["minute"], r["item"]))
        fv_rows.extend(recs)

FL_TITLES = ["Logo refresh", "Landing page mockup", "Icon set", "Pitch deck polish", "App onboarding screens",
             "Poster design", "Banner ads", "Brand guide"]
FL_CURRENCIES = {"C10": ["USD"], "C11": ["EUR", "EUR", "GBP"]}
fl_rows = []
fl_small_project = {}  # cid -> 触发 $5 最低费的项目号（出题用）


def fl_project(acct, d, cur, amount):
    return dict(acct=acct, date=d, project=f"FL-{rng2.randint(10000, 99999)}", title=rng2.choice(FL_TITLES),
                currency=cur, amount=r2(amount), type="Project Payment")


for c in CREATORS:
    cid = c["creator_id"]
    if "freelancer" not in c["accounts"]:
        continue
    acct = c["accounts"]["freelancer"]
    for month in c["active_months"]:
        recs = [fl_project(acct, rand_date2(month), rng2.choice(FL_CURRENCIES[cid]), rng2.uniform(120, 900))
                for _ in range(rng2.randint(2, 3))]
        if cid == "C10" and month == "2026-07":  # 小项目：10% 不到 $5，按 $5 收
            recs.append(fl_project(acct, rand_date2(month), "USD", rng2.uniform(20, 45)))
            fl_small_project[cid] = recs[-1]["project"]
        if cid == "C11" and month == "2026-08":  # 告警触发点：欧元项目落在缺汇率的那天
            recs.append(fl_project(acct, dt.date.fromisoformat(MISSING_FX2_DATE), "EUR", rng2.uniform(300, 700)))
        if cid == "C11" and month == "2026-09":  # 欧元小项目：换成美元后 10% 不到 $5，按 $5 收
            recs.append(fl_project(acct, rand_date2(month), "EUR", rng2.uniform(30, 45)))
        _, last = month_bounds(month)
        wd = min(max(r["date"] for r in recs) + dt.timedelta(days=2), last)
        if wd.isoformat() in (MISSING_FX_DATE, MISSING_FX2_DATE):
            wd += dt.timedelta(days=1)
        recs.append(dict(acct=acct, date=wd, project="", title="Withdrawal to bank (express)", currency="USD",
                         amount=ASSUMPTIONS["freelancer_withdrawal_fee_usd"], type="Withdrawal Fee"))
        recs.sort(key=lambda r: (r["date"], r["type"]))
        fl_rows.extend(recs)

CONTRA = {"C01": (300, 1400), "C11": (500, 2000)}
CONTRA_CLIENTS = ["Fable & Fern", "Northstar Labs", "Quiet Oak", "Helio Health", "Paperplane"]
ct_rows = []
for c in CREATORS:
    cid = c["creator_id"]
    if "contra" not in c["accounts"] or cid in RNG3_CREATORS:
        continue
    acct = c["accounts"]["contra"]
    lo, hi = CONTRA[cid]
    for month in c["active_months"]:
        recs = [dict(acct=acct, date=rand_date2(month), client=rng2.choice(CONTRA_CLIENTS),
                     project=rng2.choice(FL_TITLES), amount=r2(rng2.uniform(lo, hi)))
                for _ in range(rng2.randint(1, 2))]
        recs.sort(key=lambda r: r["date"])
        ct_rows.extend(recs)

# C12 Priya Nair：税表对账用例，第三条随机数流
rng3 = random.Random(SEED + 202)


def rand_date3(month):
    _, last = month_bounds(month)
    while True:
        d = dt.date(last.year, last.month, rng3.randint(1, last.day - 1))
        if d.isoformat() not in (MISSING_FX_DATE, MISSING_FX2_DATE):
            return d


taken_orders = {r["order"] for r in fv_rows}
for cid in sorted(RNG3_CREATORS):
    c = BY_ID[cid]
    for month in c["active_months"]:
        recs = []
        for _ in range(rng3.randint(72, 84)):
            order = f"FO{rng3.randint(100000, 999999)}"
            while order in taken_orders:
                order = f"FO{rng3.randint(100000, 999999)}"
            taken_orders.add(order)
            base = dict(acct=c["accounts"]["fiverr"], date=rand_date3(month), hour=rng3.randint(0, 23),
                        minute=rng3.randint(0, 59), order=order, buyer=rng3.choice(FIVERR_BUYERS))
            recs.append(dict(base, item="Order", amount=r2(rng3.uniform(70, 120))))
            if rng3.random() < 0.4:
                recs.append(dict(base, item="Extra", amount=r2(rng3.uniform(10, 60))))
            if rng3.random() < 0.5:
                recs.append(dict(base, item="Tip", amount=r2(rng3.uniform(5, 40))))
        _, last = month_bounds(month)
        recs.append(dict(acct=c["accounts"]["fiverr"], date=last, hour=9, minute=0, order="", buyer="",
                         item="Withdrawal Fee", amount=ASSUMPTIONS["fiverr_withdrawal_fee_usd"]))
        recs.sort(key=lambda r: (r["date"], r["hour"], r["minute"], r["item"]))
        fv_rows.extend(recs)
        ct_rows.append(dict(acct=c["accounts"]["contra"], date=rand_date3(month), client=rng3.choice(CONTRA_CLIENTS),
                            project=rng3.choice(FL_TITLES), amount=r2(rng3.uniform(400, 900))))


def fl_fee(amount):
    return r2(max(amount * ASSUMPTIONS["freelancer_fee_rate"], ASSUMPTIONS["freelancer_min_fee"]))


# ---------------------------------------------------------------- write files


def write_csv(name, header, rows, encoding="utf-8"):
    with open(DATA / name, "w", newline="", encoding=encoding) as f:
        w = csv.writer(f)
        w.writerow(header)
        w.writerows(rows)


def money(x):
    return f"{x:.2f}"


write_csv("bilibili_income.csv",
          ["账号ID", "日期", "收入类型", "流水(元)", "平台分成(元)", "已代扣个税(元)", "实际到账(元)", "备注"],
          [[r["acct"], r["date"].strftime("%Y/%m/%d"), r["type"], money(r["gross"]), money(r["share"]),
            money(r["tax"]), money(r["net"]), r["note"]] for r in bili_rows],
          encoding="utf-8-sig")

write_csv("youtube_revenue.csv",
          ["Channel ID", "Date", "Revenue Type", "Gross Revenue (USD)", "YouTube Share (USD)",
           "US Tax Withheld (USD)", "Estimated Revenue (USD)"],
          [[r["acct"], r["date"].isoformat(), r["type"], money(r["gross"]), money(r["share"]),
            money(r["withheld"]), money(r["net"])] for r in yt_rows])

write_csv("twitch_payouts.csv",
          ["Username", "Date", "Revenue Type", "Gross (USD)", "Twitch Share (USD)", "Payout (USD)"],
          [[r["acct"], r["date"].strftime("%m/%d/%Y"), r["type"], money(r["gross"]), money(r["share"]),
            money(r["payout"])] for r in tw_rows])

write_csv("patreon_earnings.csv",
          ["Creator", "Month", "Patrons", "Gross Pledges (USD)", "iOS Pledges (USD)", "Patreon Fee (USD)",
           "Payment Processing (USD)", "Payout (USD)"],
          [[r["acct"], month_label(r["month"]), r["patrons"], money(r["gross"]), money(r["ios"]),
            money(r["fee"]), money(r["proc"]), money(r["payout"])] for r in pt_rows])

write_csv("upwork_transactions.csv",
          ["Freelancer", "Date", "Type", "Contract ID", "Client", "Amount (USD)", "Service Fee Rate"],
          [[r["acct"], upwork_date(r["date"]), r["type"], r["contract"], r["client"], money(r["amount"]),
            "" if r["rate"] is None else f"{round(r['rate'] * 100)}%"] for r in uw_rows])

write_csv("fx_rates_cny_per_usd.csv", ["date", "cny_per_usd"],
          [[k, f"{v:.4f}"] for k, v in sorted(fx.items())])

write_csv("fiverr_earnings.csv",
          ["Seller", "Completed At (UTC)", "Order ID", "Item", "Buyer", "Amount (USD)"],
          [[r["acct"], f"{r['date'].isoformat()}T{r['hour']:02d}:{r['minute']:02d}:00Z", r["order"], r["item"],
            r["buyer"], money(r["amount"])] for r in fv_rows])

write_csv("freelancer_transactions.csv",
          ["username", "date", "project_id", "description", "currency", "project_amount", "entry_type"],
          [[r["acct"], r["date"].strftime("%Y%m%d"), r["project"], r["title"], r["currency"], money(r["amount"]),
            r["type"]] for r in fl_rows])

write_csv("contra_payments.csv",
          ["Profile", "Paid On", "Client", "Project", "Amount"],
          [[r["acct"], f"{r['date']:%B} {r['date'].day}, {r['date'].year}", r["client"], r["project"],
            f"${r['amount']:,.2f}"] for r in ct_rows])

write_csv("fx_rates_usd_per_unit.csv", ["date", "EUR", "GBP"],
          [[k, f"{v['EUR']:.4f}", f"{v['GBP']:.4f}"] for k, v in sorted(fx2.items())])

with open(DATA / "creators.json", "w", encoding="utf-8") as f:
    json.dump(CREATORS, f, ensure_ascii=False, indent=2)
with open(DATA / "assumptions.json", "w", encoding="utf-8") as f:
    json.dump(ASSUMPTIONS, f, ensure_ascii=False, indent=2)

# ---------------------------------------------------------------- ground truth


def ym(d):
    return d.strftime("%Y-%m")


def compute(cid, month):
    c = BY_ID[cid]
    acc = c["accounts"]
    out = {}
    error = None
    if "bilibili" in acc:
        rows = [r for r in bili_rows if r["acct"] == acc["bilibili"] and ym(r["date"]) == month]
        if rows:
            p = dict(gross=0.0, platform_fee=0.0, payment_fee=0.0, withheld=0.0, net=0.0,
                     gross_cny=0.0, platform_fee_cny=0.0, withheld_cny=0.0, net_cny=0.0)
            for r in rows:
                rate_ = fx.get(r["date"].isoformat())
                if rate_ is None:
                    error = f"缺少 {r['date'].isoformat()} 的汇率"
                    break
                p["gross"] += r["gross"] / rate_
                p["platform_fee"] += r["share"] / rate_
                p["withheld"] += r["tax"] / rate_
                p["net"] += r["net"] / rate_
                p["gross_cny"] += r["gross"]
                p["platform_fee_cny"] += r["share"]
                p["withheld_cny"] += r["tax"]
                p["net_cny"] += r["net"]
            out["bilibili"] = p
    if "youtube" in acc:
        rows = [r for r in yt_rows if r["acct"] == acc["youtube"] and ym(r["date"]) == month]
        if rows:
            out["youtube"] = dict(gross=sum(r["gross"] for r in rows),
                                  platform_fee=sum(r["share"] for r in rows), payment_fee=0.0,
                                  withheld=sum(r["withheld"] for r in rows),
                                  net=sum(r["net"] for r in rows))
    if "twitch" in acc:
        rows = [r for r in tw_rows if r["acct"] == acc["twitch"] and ym(r["date"]) == month]
        if rows:
            out["twitch"] = dict(gross=sum(r["gross"] for r in rows),
                                 platform_fee=sum(r["share"] for r in rows), payment_fee=0.0,
                                 withheld=0.0, net=sum(r["payout"] for r in rows))
    if "patreon" in acc:
        rows = [r for r in pt_rows if r["acct"] == acc["patreon"] and r["month"] == month]
        if rows:
            out["patreon"] = dict(gross=sum(r["gross"] for r in rows),
                                  platform_fee=sum(r["fee"] for r in rows),
                                  payment_fee=sum(r["proc"] for r in rows), withheld=0.0,
                                  net=sum(r["payout"] for r in rows),
                                  ios=sum(r["ios"] for r in rows))
    if "upwork" in acc:
        rows = [r for r in uw_rows if r["acct"] == acc["upwork"] and ym(r["date"]) == month]
        if rows:
            pays = [r for r in rows if r["type"] != "Withdrawal Fee"]
            gross = sum(r["amount"] for r in pays)
            fee = sum(r2(r["amount"] * r["rate"]) for r in pays)
            wfee = sum(r["amount"] for r in rows if r["type"] == "Withdrawal Fee")
            out["upwork"] = dict(gross=gross, platform_fee=fee, payment_fee=wfee, withheld=0.0,
                                 net=gross - fee - wfee)
    if "fiverr" in acc:
        rows = [r for r in fv_rows if r["acct"] == acc["fiverr"] and ym(r["date"]) == month]
        if rows:
            rate_ = ASSUMPTIONS["fiverr_service_fee"]
            pays = [r for r in rows if r["item"] != "Withdrawal Fee"]
            gross = sum(r["amount"] for r in pays)
            fee = sum(r2(r["amount"] * rate_) for r in pays)
            wfee = sum(r["amount"] for r in rows if r["item"] == "Withdrawal Fee")
            out["fiverr"] = dict(gross=gross, platform_fee=fee, payment_fee=wfee, withheld=0.0,
                                 net=gross - fee - wfee,
                                 tip_fee=sum(r2(r["amount"] * rate_) for r in pays if r["item"] == "Tip"))
    if "freelancer" in acc:
        rows = [r for r in fl_rows if r["acct"] == acc["freelancer"] and ym(r["date"]) == month]
        if rows:
            p = dict(gross=0.0, platform_fee=0.0, payment_fee=0.0, withheld=0.0, net=0.0)
            for r in rows:
                if r["type"] == "Withdrawal Fee":
                    p["payment_fee"] += r["amount"]
                    p["net"] -= r["amount"]
                    continue
                rate_ = 1.0 if r["currency"] == "USD" else fx2.get(r["date"].isoformat(), {}).get(r["currency"])
                if rate_ is None:
                    error = f"缺少 {r['date'].isoformat()} 的 {r['currency']} 汇率"
                    break
                gross_usd = r["amount"] * rate_
                fee = fl_fee(gross_usd)
                p["gross"] += gross_usd
                p["platform_fee"] += fee
                p["net"] += gross_usd - fee
            out["freelancer"] = p
    if "contra" in acc:
        rows = [r for r in ct_rows if r["acct"] == acc["contra"] and ym(r["date"]) == month]
        if rows:
            gross = sum(r["amount"] for r in rows)
            out["contra"] = dict(gross=gross, platform_fee=0.0, payment_fee=0.0, withheld=0.0, net=gross)
    total = {k: sum(p[k] for p in out.values()) for k in ["gross", "platform_fee", "payment_fee", "withheld", "net"]}
    return dict(platforms=out, total=total, error=error)


truth = {(c["creator_id"], m): compute(c["creator_id"], m) for c in CREATORS for m in MONTHS}

with open(DATA / "ground_truth_breakdown.csv", "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["creator_id", "creator_name", "month", "platform", "gross_usd", "platform_fee_usd",
                "payment_fee_usd", "withheld_usd", "net_usd", "net_rate", "error"])
    for c in CREATORS:
        for m in MONTHS:
            t = truth[(c["creator_id"], m)]
            if t["error"]:
                w.writerow([c["creator_id"], c["name"], m, "ALL", "", "", "", "", "", "", t["error"]])
                continue
            for p in PLATFORMS:
                if p in t["platforms"]:
                    v = t["platforms"][p]
                    w.writerow([c["creator_id"], c["name"], m, p, money(r2(v["gross"])),
                                money(r2(v["platform_fee"])), money(r2(v["payment_fee"])),
                                money(r2(v["withheld"])), money(r2(v["net"])),
                                f"{v['net'] / v['gross']:.4f}" if v["gross"] else "", ""])
            tt = t["total"]
            w.writerow([c["creator_id"], c["name"], m, "TOTAL", money(r2(tt["gross"])),
                        money(r2(tt["platform_fee"])), money(r2(tt["payment_fee"])),
                        money(r2(tt["withheld"])), money(r2(tt["net"])), "", ""])

# ---------------------------------------------------------------- questions

questions = []


def add(cid, month, category, text, answer, unit, traps, lang="zh", **extra):
    questions.append(dict(id=f"Q{len(questions) + 1:03d}", creator_id=cid, creator_name=BY_ID[cid]["name"],
                          month=month, category=category, lang=lang, **extra, question=text,
                          expected_answer=answer, unit=unit,
                          tolerance=0.01 if unit in ("USD", "CNY") else (0 if unit == "count" else None),
                          v1_traps=traps))


def T(cid, m):
    return truth[(cid, m)]


def net(cid, m):
    return r2(T(cid, m)["total"]["net"])


def pnet(cid, m, p):
    return r2(T(cid, m)["platforms"][p]["net"])


def best(cid, m):
    ps = T(cid, m)["platforms"]
    k = max(ps, key=lambda p: ps[p]["net"] / ps[p]["gross"])
    return PLATFORM_LABEL[k]


def set_aside(cid, m):
    return r2(T(cid, m)["total"]["net"] * BY_ID[cid]["set_aside_rate"])


def mom(cid, m, prev):
    return r2(T(cid, m)["total"]["net"] - T(cid, prev)["total"]["net"])


def ios_impact(cid, m):
    return r2(T(cid, m)["platforms"]["patreon"]["ios"] * ASSUMPTIONS["patreon_ios_apple_fee_simulated"])


def contract_fee(cid, cno):
    acct = BY_ID[cid]["accounts"]["upwork"]
    return r2(sum(r2(r["amount"] * r["rate"]) for r in uw_rows if r["acct"] == acct and r["contract"] == cno))


MON_ZH = {"2026-07": "7 月", "2026-08": "8 月", "2026-09": "9 月"}
MON_EN = {"2026-07": "July 2026", "2026-08": "August 2026", "2026-09": "September 2026"}
CUR = ["currency"]

# C01 月之灵
for m in MONTHS:
    add("C01", m, "total_net_usd", f"月之灵 2026 年 {MON_ZH[m]}所有平台加起来一共到手多少美元？",
        net("C01", m), "USD", ["currency", "missing_platform", "withholding", "upwork_rate"])
S = "2026-09"
for p in ORIG_PLATFORMS:
    add("C01", S, "platform_net_usd", f"月之灵 2026 年 9 月在 {PLATFORM_LABEL[p]} 到手多少美元？",
        pnet("C01", S, p), "USD", {"bilibili": ["currency", "withholding"], "upwork": ["upwork_rate"]}.get(p, ["gross_vs_net"]), platform=p)
add("C01", S, "platform_net_cny", "月之灵 2026 年 9 月 B 站到手多少人民币？",
    r2(T("C01", S)["platforms"]["bilibili"]["net_cny"]), "CNY", ["withholding"], platform="bilibili")
add("C01", S, "total_platform_fee_usd", "月之灵 2026 年 9 月一共被各平台抽成多少美元？（不含预扣税和提现/支付费）",
    r2(T("C01", S)["total"]["platform_fee"]), "USD", ["currency", "withholding", "upwork_rate"])
add("C01", S, "total_withheld_usd", "月之灵 2026 年 9 月被平台预扣的税一共多少美元？",
    r2(T("C01", S)["total"]["withheld"]), "USD", ["currency", "withholding"])
add("C01", S, "total_payment_fee_usd", "月之灵 2026 年 9 月的提现费和支付手续费一共多少美元？",
    r2(T("C01", S)["total"]["payment_fee"]), "USD", ["fee_classification"])
add("C01", S, "total_gross_usd", "月之灵 2026 年 9 月所有平台的毛收入一共多少美元？",
    r2(T("C01", S)["total"]["gross"]), "USD", ["currency"])
add("C01", S, "best_platform", "月之灵 2026 年 9 月哪个平台的到手率（到手 ÷ 毛收入）最高？",
    best("C01", S), "platform", ["gross_vs_net", "withholding"])
add("C01", S, "set_aside_usd", "月之灵 2026 年 9 月按她设定的比例应该预留多少美元税金？",
    set_aside("C01", S), "USD", ["currency", "set_aside_base"])
add("C01", "2026-08", "set_aside_usd", "月之灵 2026 年 8 月按她设定的比例应该预留多少美元税金？",
    set_aside("C01", "2026-08"), "USD", ["currency", "set_aside_base"])
add("C01", S, "mom_change_usd", "月之灵 2026 年 9 月总到手比 8 月多（正数）或少（负数）多少美元？",
    mom("C01", S, "2026-08"), "USD", ["currency"], compare_to="2026-08")
add("C01", S, "patreon_ios_impact_usd",
    "如果 Patreon 的 iOS 订阅要额外被苹果抽 30%，月之灵 2026 年 9 月 Patreon 到手会少多少美元？",
    ios_impact("C01", S), "USD", ["ios_base"], platform="patreon")
for cno in ["UW-2101", "UW-2102"]:
    add("C01", "2026-07~2026-09", "upwork_contract_fee_usd",
        f"月之灵在 Upwork 合同 {cno} 上，2026 年 7 到 9 月一共被收了多少美元服务费？",
        contract_fee("C01", cno), "USD", ["upwork_rate"], platform="upwork", contract_id=cno)

# C02 小鹿
for m in MONTHS:
    add("C02", m, "total_net_usd", f"小鹿 2026 年 {MON_ZH[m]}到手多少美元？", net("C02", m), "USD",
        ["currency", "withholding"])
add("C02", "2026-09", "platform_withheld_cny", "小鹿 2026 年 9 月 B 站代扣了多少人民币个税？",
    r2(T("C02", "2026-09")["platforms"]["bilibili"]["withheld_cny"]), "CNY", ["withholding"], platform="bilibili")
add("C02", "2026-08", "platform_net_cny", "小鹿 2026 年 8 月 B 站实际到账多少人民币？",
    r2(T("C02", "2026-08")["platforms"]["bilibili"]["net_cny"]), "CNY", ["withholding"], platform="bilibili")

# C03 Maya Chen (English)
for m in MONTHS:
    add("C03", m, "total_net_usd", f"How much did Maya Chen take home in total across all platforms in {MON_EN[m]} (USD)?",
        net("C03", m), "USD", ["missing_platform", "gross_vs_net"], lang="en")
add("C03", S, "best_platform", "Which platform had Maya Chen's highest take-home rate (net ÷ gross) in September 2026?",
    best("C03", S), "platform", ["gross_vs_net"], lang="en")
add("C03", "2026-08", "set_aside_usd", "How much should Maya Chen set aside for taxes for August 2026, using her own set-aside rate (USD)?",
    set_aside("C03", "2026-08"), "USD", ["set_aside_base"], lang="en")
add("C03", S, "total_platform_fee_usd", "How much did platforms take from Maya Chen in fees in September 2026, excluding payment processing (USD)?",
    r2(T("C03", S)["total"]["platform_fee"]), "USD", ["fee_classification"], lang="en")

# C04 阿柚
add("C04", S, "total_net_usd", "阿柚 2026 年 9 月一共到手多少美元？", net("C04", S), "USD",
    ["currency", "withholding"])
add("C04", S, "total_withheld_usd", "阿柚 2026 年 9 月被预扣的税一共多少美元？（B 站个税和 YouTube 美国预扣都算）",
    r2(T("C04", S)["total"]["withheld"]), "USD", ["currency", "withholding"])
add("C04", S, "platform_withheld_usd", "阿柚 2026 年 9 月 YouTube 预扣了多少美元的美国税？",
    r2(T("C04", S)["platforms"]["youtube"]["withheld"]), "USD", ["withholding"], platform="youtube")
add("C04", "2026-08", "platform_net_usd", "阿柚 2026 年 8 月 YouTube 到手多少美元？",
    pnet("C04", "2026-08", "youtube"), "USD", ["withholding"], platform="youtube")
add("C04", "2026-07", "total_platform_fee_usd", "阿柚 2026 年 7 月一共被平台抽成多少美元？（不含预扣税）",
    r2(T("C04", "2026-07")["total"]["platform_fee"]), "USD", ["currency", "withholding"])

# C05 Leo Park (English)
add("C05", S, "platform_net_usd", "How much did Leo Park take home from YouTube in September 2026 (USD)?",
    pnet("C05", S, "youtube"), "USD", ["refund"], lang="en", platform="youtube")
add("C05", S, "total_net_usd", "What was Leo Park's total take-home across platforms in September 2026 (USD)?",
    net("C05", S), "USD", ["refund"], lang="en")
add("C05", "2026-08", "platform_net_usd", "How much did Leo Park take home from Twitch in August 2026 (USD)?",
    pnet("C05", "2026-08", "twitch"), "USD", ["gross_vs_net"], lang="en", platform="twitch")
add("C05", S, "mom_change_usd", "How much did Leo Park's total take-home change from August to September 2026 (USD, negative if down)?",
    mom("C05", S, "2026-08"), "USD", ["refund"], lang="en", compare_to="2026-08")

# C06 Nina Rossi (English)
for m in MONTHS:
    add("C06", m, "total_net_usd", f"How much did Nina Rossi take home from Upwork in {MON_EN[m]} after service and withdrawal fees (USD)?",
        net("C06", m), "USD", ["upwork_rate"], lang="en")
for cno, *_ in UPWORK_CONTRACTS["C06"]:
    add("C06", "2026-07~2026-09", "upwork_contract_fee_usd",
        f"How much in Upwork service fees did Nina Rossi pay on contract {cno} from July to September 2026 (USD)?",
        contract_fee("C06", cno), "USD", ["upwork_rate"], lang="en", platform="upwork", contract_id=cno)
add("C06", S, "set_aside_usd", "How much should Nina Rossi set aside for taxes for September 2026, using her own set-aside rate (USD)?",
    set_aside("C06", S), "USD", ["upwork_rate", "set_aside_base"], lang="en")
add("C06", S, "total_payment_fee_usd", "How much did Nina Rossi pay in withdrawal fees in September 2026 (USD)?",
    r2(T("C06", S)["total"]["payment_fee"]), "USD", ["fee_classification"], lang="en")

# C07 墨白
A = "2026-08"
add("C07", A, "total_net_usd", "墨白 2026 年 8 月一共到手多少美元？", net("C07", A), "USD",
    ["currency", "withholding", "big_single"])
add("C07", A, "platform_net_cny", "墨白 2026 年 8 月 B 站实际到账多少人民币？",
    r2(T("C07", A)["platforms"]["bilibili"]["net_cny"]), "CNY", ["withholding", "big_single"], platform="bilibili")
add("C07", A, "patreon_ios_impact_usd", "如果 Patreon 的 iOS 订阅要额外被苹果抽 30%，墨白 2026 年 8 月 Patreon 到手会少多少美元？",
    ios_impact("C07", A), "USD", ["ios_base"], platform="patreon")
add("C07", A, "set_aside_usd", "墨白 2026 年 8 月按她设定的比例应该预留多少美元税金？",
    set_aside("C07", A), "USD", ["currency", "big_single", "set_aside_base"])
add("C07", A, "platform_withheld_cny", "墨白 2026 年 8 月 B 站代扣了多少人民币个税？",
    r2(T("C07", A)["platforms"]["bilibili"]["withheld_cny"]), "CNY", ["withholding", "big_single"], platform="bilibili")
add("C07", S, "mom_change_usd", "墨白 2026 年 9 月总到手比 8 月多（正数）或少（负数）多少美元？",
    mom("C07", S, A), "USD", ["currency", "big_single"], compare_to="2026-08")

# C08 Sam Ito (English)
add("C08", A, "total_net_usd", "How much did Sam Ito take home across all platforms in August 2026 (USD)?",
    net("C08", A), "USD", ["empty_month"], lang="en")
add("C08", S, "total_net_usd", "How much did Sam Ito take home across all platforms in September 2026 (USD)?",
    net("C08", S), "USD", ["withholding", "upwork_rate"], lang="en")
add("C08", S, "total_withheld_usd", "How much tax was withheld from Sam Ito's platform income in September 2026 (USD)?",
    r2(T("C08", S)["total"]["withheld"]), "USD", ["withholding"], lang="en")
add("C08", "2026-07~2026-09", "upwork_contract_fee_usd",
    "How much in Upwork service fees did Sam Ito pay on contract UW-4101 from July to September 2026 (USD)?",
    contract_fee("C08", "UW-4101"), "USD", ["upwork_rate"], lang="en", platform="upwork", contract_id="UW-4101")
add("C08", S, "mom_change_usd", "How much did Sam Ito's total take-home change from August to September 2026 (USD)?",
    mom("C08", S, A), "USD", ["empty_month"], lang="en", compare_to="2026-08")

# C09 Kiki：告警用例，正确行为是换算步骤报错，不能编数字
def add_alert(cid, month, text, behavior, lang="zh", **extra):
    questions.append(dict(id=f"Q{len(questions) + 1:03d}", creator_id=cid, creator_name=BY_ID[cid]["name"],
                          month=month, category="alert_missing_fx", lang=lang, **extra, question=text,
                          expected_answer=None, unit=None, tolerance=None, expected_behavior=behavior,
                          v1_traps=["missing_fx"]))


KIKI = f"人民币换美元的步骤应报错（缺少 {MISSING_FX_DATE} 的汇率），触发 PRISM 告警；agent 必须说明无法计算，不能编造数字"
add_alert("C09", "2026-09", "Kiki 2026 年 9 月一共到手多少美元？", KIKI)
add_alert("C09", "2026-09", "Kiki 2026 年 9 月 B 站到手多少美元？", KIKI, platform="bilibili")
add_alert("C09", "2026-09", "Kiki 2026 年 9 月应该预留多少美元税金？", KIKI)

# ---------------------------------------------------------------- 新平台和税务层（Q065 起）

Q3 = ["2026-07", "2026-08", "2026-09"]
Q3_LABEL = "2026-07~2026-09"


def quarter_total(cid, key):
    return sum(T(cid, m)["total"][key] for m in Q3)


def next_due(after):
    return next(d for d in US_ESTIMATED_TAX_DUE if d > after)


def fiverr_tip_fee(cid, m):
    return r2(T(cid, m)["platforms"]["fiverr"]["tip_fee"])


def fl_project_fee(cno):
    r = next(r for r in fl_rows if r["project"] == cno)
    assert r["currency"] == "USD"
    return fl_fee(r["amount"])


withheld_platforms = sorted({p for m in Q3 for p, v in T("C01", m)["platforms"].items() if v["withheld"]})
assert withheld_platforms == ["bilibili"], withheld_platforms

add("C01", S, "platform_fee_usd", "月之灵 2026 年 9 月在 Fiverr 一共被收了多少美元服务费？（订单、小费、加购都算）",
    r2(T("C01", S)["platforms"]["fiverr"]["platform_fee"]), "USD", ["fiverr_tip_fee"], platform="fiverr")
add("C01", S, "platform_net_usd", "月之灵 2026 年 9 月在 Contra 到手多少美元？",
    pnet("C01", S, "contra"), "USD", ["zero_fee"], platform="contra")
add("C10", A, "platform_net_usd",
    "How much did Diego Alvarez take home from Fiverr in August 2026 after Fiverr's fees and withdrawal fees (USD)?",
    pnet("C10", A, "fiverr"), "USD", ["fiverr_tip_fee", "fee_classification"], lang="en", platform="fiverr")
add("C10", S, "fiverr_tip_fee_usd", "How much did Fiverr keep from Diego Alvarez's tips in September 2026 (USD)?",
    fiverr_tip_fee("C10", S), "USD", ["fiverr_tip_fee"], lang="en", platform="fiverr")
add("C10", "2026-07", "platform_fee_usd",
    "How much did Diego Alvarez pay in Freelancer.com project fees in July 2026, excluding withdrawal fees (USD)?",
    r2(T("C10", "2026-07")["platforms"]["freelancer"]["platform_fee"]), "USD", ["min_fee"], lang="en",
    platform="freelancer")
add("C10", Q3_LABEL, "freelancer_project_fee_usd",
    f"What fee did Freelancer.com charge Diego Alvarez on project {fl_small_project['C10']} (USD)?",
    fl_project_fee(fl_small_project["C10"]), "USD", ["min_fee"], lang="en", platform="freelancer",
    project_id=fl_small_project["C10"])
add("C11", S, "platform_net_usd",
    "How much did Lena Koch take home from Freelancer.com in September 2026, converted to USD?",
    pnet("C11", S, "freelancer"), "USD", ["currency", "min_fee"], lang="en", platform="freelancer")
add("C11", "2026-07", "total_net_usd", "How much did Lena Koch take home in total across all platforms in July 2026 (USD)?",
    net("C11", "2026-07"), "USD", ["currency", "zero_fee", "missing_platform"], lang="en")
add("C01", Q3_LABEL, "quarter_withheld_usd", "月之灵 2026 年第三季度（7–9 月）各平台一共替她预扣了多少美元的税？",
    r2(quarter_total("C01", "withheld")), "USD", ["withholding", "currency"])
add("C01", Q3_LABEL, "quarter_set_aside_usd", "月之灵 2026 年第三季度（7–9 月）按她设定的比例一共应该预留多少美元税金？",
    r2(quarter_total("C01", "net") * BY_ID["C01"]["set_aside_rate"]), "USD", ["currency", "set_aside_base"])
add("C01", Q3_LABEL, "withholding_platform", "月之灵 2026 年第三季度哪个平台替她预扣过税？",
    PLATFORM_LABEL[withheld_platforms[0]], "platform", ["withholding"])
add("C01", S, "next_estimated_tax_due", "2026 年 9 月 20 日之后，月之灵下一次美国季度预估税的截止日是哪天？",
    next_due("2026-09-20"), "date", ["tax_calendar"], after_date="2026-09-20")
add("C10", S, "next_estimated_tax_due",
    "After September 10, 2026, when is Diego Alvarez's next US estimated tax payment due?",
    next_due("2026-09-10"), "date", ["tax_calendar"], lang="en", after_date="2026-09-10")
add("C10", Q3_LABEL, "quarter_set_aside_usd",
    "How much should Diego Alvarez set aside for taxes for Q3 2026 (July–September), using his own set-aside rate (USD)?",
    r2(quarter_total("C10", "net") * BY_ID["C10"]["set_aside_rate"]), "USD",
    ["fiverr_tip_fee", "min_fee", "set_aside_base"], lang="en")

LENA = f"欧元换美元的步骤应报错（缺少 {MISSING_FX2_DATE} 的 EUR 汇率），触发 PRISM 告警；agent 必须说明无法计算，不能编造数字"
add_alert("C11", A, "How much did Lena Koch take home in total across all platforms in August 2026 (USD)?", LENA, lang="en")
add_alert("C11", A, "How much did Lena Koch earn on Freelancer.com in August 2026, in USD after fees?", LENA, lang="en",
          platform="freelancer")
add_alert("C11", A, "How much should Lena Koch set aside for taxes for August 2026, using her own rate (USD)?", LENA,
          lang="en")

# ---------------------------------------------------------------- 税表对账（Q082 起）
# 税表口径毛额 = 扣费前的每笔收款（正数）之和；退款单独列出；交易数：每行收款一笔，Patreon 按赞助人数


def form_rows(cid, p, months):
    acct = BY_ID[cid]["accounts"].get(p)
    if acct is None:
        return None
    if p == "youtube":
        rows = [r for r in yt_rows if r["acct"] == acct and ym(r["date"]) in months]
        pos = [r["gross"] for r in rows if r["gross"] > 0]
        return dict(gross=sum(pos), refunds=-sum(r["gross"] for r in rows if r["gross"] < 0), txns=len(pos))
    if p == "twitch":
        rows = [r for r in tw_rows if r["acct"] == acct and ym(r["date"]) in months]
        return dict(gross=sum(r["gross"] for r in rows), refunds=0.0, txns=len(rows))
    if p == "patreon":
        rows = [r for r in pt_rows if r["acct"] == acct and r["month"] in months]
        return dict(gross=sum(r["gross"] for r in rows), refunds=0.0, txns=sum(r["patrons"] for r in rows))
    if p == "upwork":
        rows = [r for r in uw_rows if r["acct"] == acct and ym(r["date"]) in months and r["type"] != "Withdrawal Fee"]
        return dict(gross=sum(r["amount"] for r in rows), refunds=0.0, txns=len(rows))
    if p == "fiverr":
        rows = [r for r in fv_rows if r["acct"] == acct and ym(r["date"]) in months and r["item"] != "Withdrawal Fee"]
        return dict(gross=sum(r["amount"] for r in rows), refunds=0.0, txns=len(rows))
    if p == "freelancer":
        rows = [r for r in fl_rows if r["acct"] == acct and ym(r["date"]) in months and r["type"] != "Withdrawal Fee"]
        gross = sum(r["amount"] * (1.0 if r["currency"] == "USD" else fx2[r["date"].isoformat()][r["currency"]])
                    for r in rows)
        return dict(gross=gross, refunds=0.0, txns=len(rows))
    if p == "contra":
        rows = [r for r in ct_rows if r["acct"] == acct and ym(r["date"]) in months]
        return dict(gross=sum(r["amount"] for r in rows), refunds=0.0, txns=len(rows))
    raise ValueError(p)


def form_view(cid, p, months):
    f = form_rows(cid, p, months)
    parts = [T(cid, m)["platforms"][p] for m in months if p in T(cid, m)["platforms"]]
    landed = sum(x["net"] for x in parts)
    items = {k: sum(x[k] for x in parts) for k in ("platform_fee", "payment_fee", "withheld")}
    gap = f["gross"] - landed
    assert abs(gap - (sum(items.values()) + f["refunds"])) < 1e-6, (cid, p, gap, items, f)
    return dict(form_gross=f["gross"], landed=landed, gap=gap, txns=f["txns"], refunds=f["refunds"], **items)


K = ASSUMPTIONS["form_1099k_threshold"]
PACE = 12 / len(ASSUMPTIONS["data_coverage_months"])


def projected_over_1099k(cid, p):
    fv = form_rows(cid, p, ASSUMPTIONS["data_coverage_months"])
    return fv["gross"] * PACE > K["gross_usd"] and fv["txns"] * PACE > K["transactions"]


def k_platforms(cid):
    return [p for p in BY_ID[cid]["accounts"] if ASSUMPTIONS["tax_forms"][p]["form"] == "1099-K"]


def duplicate_platforms(cid):
    methods = BY_ID[cid].get("payout_methods", {})
    return [p for p in BY_ID[cid]["accounts"]
            if methods.get(p) in ASSUMPTIONS["payout_apps_issuing_1099k"] and ASSUMPTIONS["tax_forms"][p]["form"] != "none"]


assert [p for p in k_platforms("C12") if projected_over_1099k("C12", p)] == ["fiverr"]
fv_c12 = form_rows("C12", "fiverr", Q3)
assert fv_c12["gross"] > K["gross_usd"] and fv_c12["txns"] > K["transactions"], fv_c12  # 7–9 月本身就已超过
dup_c01, dup_c03 = duplicate_platforms("C01"), duplicate_platforms("C03")
assert dup_c01 == ["fiverr"] and dup_c03 == ["patreon"], (dup_c01, dup_c03)

add("C01", Q3_LABEL, "form_view_gross_usd",
    "月之灵 2026 年第三季度（7–9 月）Upwork 的税表口径毛收入是多少美元？（1099-K 这类税表报的是扣平台费之前的毛额）",
    r2(form_view("C01", "upwork", Q3)["form_gross"]), "USD", ["form_gross"], platform="upwork")
add("C01", Q3_LABEL, "form_gap_usd",
    "月之灵 2026 年第三季度（7–9 月）Fiverr 税表口径的毛收入，比她在 Fiverr 实际到手的钱多出多少美元？",
    r2(form_view("C01", "fiverr", Q3)["gap"]), "USD", ["form_gross", "fiverr_tip_fee"], platform="fiverr")
add("C05", Q3_LABEL, "form_gap_usd",
    "For Q3 2026 (July–September), how much higher is Leo Park's form-view gross on YouTube (payments before fees, "
    "refunds not netted out) than what actually landed (USD)?",
    r2(form_view("C05", "youtube", Q3)["gap"]), "USD", ["form_gross", "refund"], lang="en", platform="youtube")
add("C01", Q3_LABEL, "threshold_platform_count",
    "按 2026 年 7–9 月的速度推算全年（×4），月之灵有几个平台的收入会超过 1099-K 门槛（全年毛额超过 $20,000 且交易超过 200 笔）？",
    sum(projected_over_1099k("C01", p) for p in k_platforms("C01")), "count", ["threshold", "form_gross"])
add("C12", Q3_LABEL, "transaction_count",
    "How many Fiverr payment transactions did Priya Nair have from July to September 2026? "
    "(Each order, extra and tip counts as one; withdrawal fees don't count.)",
    form_rows("C12", "fiverr", Q3)["txns"], "count", ["threshold"], lang="en", platform="fiverr")
add("C12", Q3_LABEL, "form_view_gross_usd",
    "What form-view gross (before Fiverr's fees and withdrawal fees) did Priya Nair's Fiverr income reach from "
    "July to September 2026 (USD)?",
    r2(fv_c12["gross"]), "USD", ["form_gross", "threshold"], lang="en", platform="fiverr")
add("C01", Q3_LABEL, "duplicate_report_platform",
    "月之灵哪个平台的收入可能被重复申报（平台开一次 1099-K，钱提现到的付款账户又开一次）？",
    PLATFORM_LABEL[dup_c01[0]], "platform", ["duplicate_report"])
add("C03", Q3_LABEL, "duplicate_report_platform",
    "Which of Maya Chen's platforms could have the same income reported twice — once by the platform and once by "
    "the payment app it pays out to?",
    PLATFORM_LABEL[dup_c03[0]], "platform", ["duplicate_report"], lang="en")

with open(DATA / "questions.jsonl", "w", encoding="utf-8") as f:
    for q in questions:
        f.write(json.dumps(q, ensure_ascii=False) + "\n")

print(f"bilibili rows: {len(bili_rows)}, youtube: {len(yt_rows)}, twitch: {len(tw_rows)}, "
      f"patreon: {len(pt_rows)}, upwork: {len(uw_rows)}, fiverr: {len(fv_rows)}, freelancer: {len(fl_rows)}, "
      f"contra: {len(ct_rows)}, fx days: {len(fx)} CNY / {len(fx2)} EUR+GBP")
n_alert = sum(q["category"] == "alert_missing_fx" for q in questions)
print(f"questions: {len(questions)} (accuracy {len(questions) - n_alert}, alert {n_alert})")
