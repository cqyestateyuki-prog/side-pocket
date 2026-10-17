# Your own statements: API

Backend for "bring your own statements". The screens for it are waiting on the design kit, so
this is the contract the UI will build on.

## Flow

1. The user drops statement files. The browser keeps them (IndexedDB), never the server.
2. `POST /api/personal/detect` says what each file is: platform, accounts, months, rows, skipped rows.
3. Every page request sends the files again with the settings. The server parses them in memory,
   answers, and forgets them.

## Request (all endpoints)

```json
{
  "files": [{"name": "bilibili_income.csv", "content": "账号ID,日期,…"},
            {"name": "export.csv", "content_base64": "…"}],
  "tax_home": "US",              // "US" | "CN" | "BOTH"
  "currency": "USD",             // "USD" | "CNY": the currency amounts are shown in
  "set_aside_rate": 0.25,        // 0 to 0.6, chosen by the user
  "payout_methods": {"fiverr": "PayPal"},
  "reference_rates": true,       // false: only rate files the user uploaded
  "month": "2026-09",            // overview, ledger. Default: latest month in the files
  "period": "2026-Q3",           // tax-items, forms, report. Default: that month's quarter
  "after": "2026-10-17"          // deadlines after this date. Default: today
}
```

`content` is text. `content_base64` is the file's bytes, read as UTF-8 and then GB18030 (what
Excel in China usually saves). Up to 40 files and 4 MB per request.

## Endpoints

| Endpoint | Returns |
|---|---|
| `POST /api/personal/detect` | `import` only (no rates fetched) |
| `POST /api/personal/overview` | same shape as `GET /api/overview` |
| `POST /api/personal/ledger` | same shape as `GET /api/ledger` |
| `POST /api/personal/tax-items` | `GET /api/tax-items` plus `tax_home`, `by_country`, `assumptions` |
| `POST /api/personal/forms` | `GET /api/forms`, or `{"applies": false}` when the tax home has no US |
| `POST /api/personal/report` | `GET /api/report`, with `tax` as in tax-items |
| `POST /api/personal/ask` | server-sent events, like `POST /api/ask`, plus `question` in the body |

Every response also carries `import` (what was read) and `settings` (what was used).

Money keys carry the display currency where a response mixes amounts: `net_usd` or `net_cny`,
`total_net_cny`. In CNY, a CNY record is shown as it is; anything else goes to USD at its date's
rate (`fx`) and then to CNY at the CNY per USD rate for that date (`fx_cny`). US form figures
(`forms`) are always USD.

### `import`

```json
{"files": [{"file": "bilibili_income.csv", "kind": "statement", "platform": "bilibili", "label": "B站",
            "accounts": ["bili_330121"], "rows": 42, "records": 42, "skipped_rows": 0, "skipped": [],
            "first_date": "2026-07-01", "last_date": "2026-09-30", "months": ["2026-07", "…"],
            "currencies": ["CNY"]},
           {"file": "notes.csv", "kind": "unknown", "message": "These columns don't match …"}],
 "platforms": [{"platform": "bilibili", "label": "B站", "accounts": ["bili_330121"]}],
 "months": ["2026-07", "2026-08", "2026-09"], "records": 97,
 "rate_sources": {"CNY": "your rate file"}, "rates_note": null,
 "overlaps": []}
```

`kind` is `statement`, `rates`, `unknown`, `empty` or `duplicate` (same content as an earlier
file, counted once). `skipped` lists up to 20 rows that couldn't be read, by line number.
`overlaps` flags two different files that cover the same dates for one account.

### `by_country` (tax-items)

One section per country in the tax home:

```json
{"country": "CN", "label": "China", "forms_apply": false,
 "deadlines": [{"id": "cn_annual_reconciliation", "opens": "2027-03-01", "closes": "2027-06-30",
                "basis": "real", "source": "PRC Individual Income Tax Law, Article 11 …"}],
 "items": [{"text": "Bilibili withheld ¥235.75 of individual income tax. …", "basis": "real",
            "source": "PRC Individual Income Tax Law, Articles 10 and 11"}]}
```

US: next quarterly estimated tax date (weekends moved to Monday), foreign tax credit for tax
withheld abroad, US tax withheld, income with nothing withheld, FBAR reminder when there is
CNY income. China: the March 1 to June 30 annual filing window, prepaid tax withheld by Chinese
platforms, credit for tax paid abroad, where income is sourced, how China converts foreign
currency, and W-8BEN (China-only home). `assumptions` lists what the numbers rest on, each
`real`, `simulated` or `your choice`.

## Recognised files

Recognised by the header row, which may sit under up to 9 title lines. Matching ignores case,
spaces, a byte-order mark and full-width brackets.

- Statements: the 8 formats in `daoshou/statements.py` (`STATEMENTS`). These follow the bundled
  sample exports. Real platform exports still need checking against real files.
- Rate files: `date,cny_per_usd` (CNY per 1 USD), or `date` plus currency-code columns such as
  `date,EUR,GBP` (USD per 1 unit).

## Exchange rates

Per currency: the user's rate file if they uploaded one, used exactly as given (a date it lacks
has no rate). Otherwise ECB reference rates from api.frankfurter.dev, crossed through EUR. A
weekend or holiday record uses the last rate published on or before its date (up to a week
back), and `rate_date` shows which. A record with no rate is left out of every total and
listed under `issues` with `complete: false`. It is never estimated.

## Privacy: what the server does

- Stores nothing. No database. Nothing is written to disk. Bodies are JSON, because multipart
  uploads can spool to a temp file.
- `Cache-Control: no-store` and `Pragma: no-cache` on every `/api/personal/*` response,
  errors included.
- Logs nothing from the body. Inputs are never in the URL. Validation errors don't echo the
  input. An unexpected error is logged by its class name only.
- Refuses bodies over 4 MB with 413.
- Outbound calls:
  - ECB rates: currency codes and a date range only;
  - for `/ask`, the model gets totals only (per-platform and per-month sums, tax items, form
    checks; never a record, payment date, order or contract id, account or client name; accounts
    appear as "account 1");
  - PRISM gets the run content-free: steps, tool names, timings, token counts, status and
    error kind, but no question, answer, tool input or output.
- `/ask` returns 503 with a plain message when the server has no model key (the public
  deployment). Every other endpoint works without keys.

## What the server can't promise

- Vercel's platform logs record each request's path, time, status and IP.
- The question typed into Ask Atlas goes to the model as written. If it contains a name, the
  model provider sees it.
- Files in the browser's IndexedDB are as safe as the device and browser profile. Clearing
  site data removes them.
- An ECB rate is a published reference rate, not the rate the user's bank or a tax authority
  used. China, for example, uses the PBOC central parity rate (see `tax_home.py`).

## Tests

`.venv/bin/python -m pytest -q`, offline. Checks that:
- each creator's own exports, uploaded, give the demo's numbers on every endpoint;
- C11's missing EUR rate for 2026-08-21 is reported, not estimated;
- the ledger matches `ground_truth_breakdown.csv`;
- `check_answers.py` still scores 89/89;
- the privacy behaviour above holds;
- the model never sees record-level data, and PRISM never sees content.
