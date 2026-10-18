"""What a US or China tax home means for the tax page: deadlines, reminders and where each rule comes from.

Informational only. Every rule says whether it is a real rule (with its source) or a simulated
assumption used by Side Pocket, so the page can label it. Amounts come from the caller, which takes
them from the ledger; nothing here does money math beyond adding up what it is given.
"""
from __future__ import annotations

from datetime import date, timedelta

from . import ledger

HOMES = {"US": ["US"], "CN": ["CN"], "BOTH": ["US", "CN"]}
REAL, SIMULATED = "real", "simulated"


def _weekday_on_or_after(d: date) -> date:
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def us_estimated_tax_due_dates(year: int) -> list[str]:
    """Quarterly estimated-tax due dates for a tax year: April 15, June 15, September 15 and January 15
    of the next year, moved to the next weekday when one falls on a weekend."""
    listed = [d for d in ledger.assumptions()["us_estimated_tax_due_dates"] if d.startswith(str(year))
              or d == f"{year + 1}-01-15"]
    if len(listed) == 4:  # 2026, checked against the IRS
        return listed
    days = [date(year, 4, 15), date(year, 6, 15), date(year, 9, 15), date(year + 1, 1, 15)]
    return [_weekday_on_or_after(d).isoformat() for d in days]


def next_us_estimated_tax_due(after: str) -> str | None:
    year = int(after[:4])
    return next((d for y in (year - 1, year) for d in us_estimated_tax_due_dates(y) if d > after), None)


def cn_window(tax_year: int) -> dict:
    return {"opens": f"{tax_year + 1}-03-01", "closes": f"{tax_year + 1}-06-30"}


def _name(label: str) -> str:
    """Platform names in sentences are English (the UI is English); the ledger labels Bilibili B站."""
    return "Bilibili" if label == "B站" else label


def _platforms(names) -> str:
    return ", ".join(sorted(_name(n) for n in names))


def sections(*, tax_home: str, months: list[str], after: str, withheld: list[dict], platforms_seen: list[str],
             currency: str, has_cny_income: bool) -> list[dict]:
    """One section per country in the tax home.

    withheld: rows like {"platform": "B站", "country": "CN", "amount": 15.36, "amount_cny": 109.8 | None}
    in the display currency. platforms_seen: labels of platforms with income in the period.
    """
    tax_year = int(months[-1][:4])
    sym = "¥" if currency == "CNY" else "$"
    out = []
    for country in HOMES[tax_home]:
        foreign = [w for w in withheld if w["country"] != country]
        domestic = [w for w in withheld if w["country"] == country]
        none_withheld = sorted(set(platforms_seen) - {w["platform"] for w in withheld})
        if country == "US":
            schedule = us_estimated_tax_due_dates(tax_year)
            due = next_us_estimated_tax_due(after)
            deadlines = [{"id": "us_estimated_tax", "label": "Next US quarterly estimated tax payment",
                          "date": due, "schedule": schedule, "basis": REAL,
                          "source": "IRS Form 1040-ES; a date on a weekend or legal holiday moves to the next "
                                    "business day"}]
            items = [{"text": f"Tax withheld by {_name(w['platform'])} ({w['country']}): {sym}{w['amount']}. Ask whether "
                              f"it can be claimed as a foreign tax credit on your US return.",
                      "basis": REAL, "source": "IRS Form 1116 (foreign tax credit)"} for w in foreign]
            items += [{"text": f"US tax withheld by {_name(w['platform'])}: {sym}{w['amount']}. It counts toward the tax "
                               f"you owe for the year.", "basis": REAL, "source": "IRS Form 1040"} for w in domestic]
            if none_withheld:
                items.append({"text": "No tax was withheld on income from " + _platforms(none_withheld)
                                      + ". The set-aside is there for it.", "basis": REAL,
                              "source": "Income is reportable even without a tax form"})
            if has_cny_income:
                items.append({"text": "If your accounts outside the US held more than $10,000 in total at any "
                                      "point in the year, an FBAR (FinCEN Form 114) is due. Side Pocket can't see "
                                      "account balances.", "basis": REAL,
                              "source": "FinCEN Form 114, due April 15 with an automatic extension to October 15"})
            out.append({"country": "US", "label": "United States", "deadlines": deadlines, "items": items,
                        "forms_apply": True})
        else:
            window = cn_window(tax_year)
            deadlines = [
                {"id": "cn_annual_reconciliation", "label": f"China annual individual income tax filing for "
                                                            f"{tax_year}", **window, "basis": REAL,
                 "source": "PRC Individual Income Tax Law, Article 11 (annual reconciliation, March 1 to June 30)"},
                {"id": "cn_foreign_income", "label": f"Report {tax_year} income from outside China", **window,
                 "basis": REAL, "source": "PRC Individual Income Tax Law, Article 13"}]
            items = []
            for w in domestic:
                amount = f"¥{w['amount_cny']}" if w.get("amount_cny") is not None else f"{sym}{w['amount']}"
                items.append({"text": f"{_name(w['platform'])} withheld {amount} of individual income tax. It counts as "
                                      "tax already prepaid in your annual filing.", "basis": REAL,
                              "source": "PRC Individual Income Tax Law, Articles 10 and 11"})
            items += [{"text": f"Tax withheld by {_name(w['platform'])} ({w['country']}): {sym}{w['amount']}. Tax paid "
                               "abroad on income from abroad can be credited against Chinese tax on that income, up "
                               "to a limit per country.", "basis": REAL,
                       "source": "PRC Individual Income Tax Law, Article 7"} for w in foreign]
            if none_withheld:
                items.append({"text": "No Chinese tax was withheld on income from " + _platforms(none_withheld)
                                      + ". Whether it counts as income from inside or outside China depends on "
                                        "where you did the work; ask your accountant. Either way it goes in your "
                                        "annual filing.", "basis": REAL,
                              "source": "Implementing Regulations of the PRC Individual Income Tax Law, Article 3"})
            items.append({"text": "China converts foreign-currency income at the RMB central parity rate for the "
                                  "last day of the month before you file. Side Pocket converts each record at its own "
                                  "date, so filed amounts can differ slightly.", "basis": REAL,
                          "source": "Implementing Regulations of the PRC Individual Income Tax Law, Article 32"})
            if tax_home == "CN":  # someone who is also a US taxpayer gives a W-9 instead
                items.append({"text": "Platforms outside China usually ask non-US people for a W-8BEN form instead "
                                      "of sending a 1099.", "basis": REAL, "source": "IRS Form W-8BEN"})
            out.append({"country": "CN", "label": "China", "deadlines": deadlines, "items": items,
                        "forms_apply": False})
    return out


def assumptions(tax_home: str) -> list[dict]:
    """What the numbers rest on, labelled real or simulated."""
    a = ledger.assumptions()
    out = [
        {"topic": "Amounts", "basis": REAL, "text": "Gross, fees, tax withheld and payouts are read from your "
                                                    "statements as they are."},
        {"topic": "Fiverr fee", "basis": REAL, "text": "20% of every order, extra and tip, each rounded to the "
                                                       "cent."},
        {"topic": "Freelancer.com fee", "basis": REAL, "text": "10% of the project's USD value or $5, whichever is "
                                                               "greater."},
        {"topic": "Exchange rates", "basis": REAL, "text": "Each record is converted at its own date: your rate "
                                                           "file if you uploaded one, otherwise the ECB reference "
                                                           "rate published on or before that date."},
        {"topic": "Set-aside", "basis": "your choice", "text": "Net income × the rate you set. Not a tax "
                                                               "calculation."},
        {"topic": "Patreon iOS", "basis": SIMULATED, "text": f"Apple's extra cut on iOS pledges is shown at "
                                                             f"{float(a['patreon_ios_apple_fee_simulated']):.0%}."},
    ]
    if "US" in HOMES[tax_home]:
        out += [{"topic": "Which form each platform sends", "basis": SIMULATED,
                 "text": "Examples only. Check with each platform and the IRS."},
                {"topic": "1099-K threshold", "basis": REAL,
                 "text": f"A payment platform files a 1099-K when it pays you more than "
                         f"${a['form_1099k_threshold']['gross_usd']:,} over more than "
                         f"{a['form_1099k_threshold']['transactions']} transactions in a calendar year."},
                {"topic": "1099-MISC/NEC threshold", "basis": SIMULATED,
                 "text": f"${a['form_1099misc_threshold_usd']:,} is used as an example. Check with the IRS."}]
    return out
