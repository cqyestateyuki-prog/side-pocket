# Your own statements: API

This is the contract the frontend builds on. Implementation: `api/personal.py`, plus
`daoshou/statements.py`, `daoshou/fx.py`, `daoshou/tax_home.py`, `daoshou/bookkeeping.py`
(manual entries), `daoshou/rewards.py` (goal and badges) and `daoshou/agent_personal.py`.

## Flow

1. On start, call `GET /api/personal/formats` once.
2. When the user drops files, the browser:
   - finds each file's header row and platform with `formats`;
   - replaces every value in the platform's `account_column` with its own stable label
     (`acct-NNNN`, 4 digits from a salted hash the browser keeps);
   - may drop every column that isn't the account column or in `columns`, because the server
     ignores them;
   - stores the result in IndexedDB.

   The server never sees real account names.
3. `POST /api/personal/detect` shows what was recognised.
4. Every page request sends the stored files plus the settings. The server computes in memory
   and keeps nothing.

The server doesn't care what the account values look like. They only group rows. Before
anything reaches the model, it swaps them again for codes of its own (see `/ask`).

## `GET /api/personal/formats`

Static, with no user data.

```json
{
  "matching": {"header_scan_lines": 10,
               "rule": "A file is a platform's statement when its header row (one of the first 10 lines) contains every column in `columns`.",
               "normalise": ["drop a byte-order mark (U+FEFF)", "full-width brackets （） become ()",
                             "remove all whitespace", "lowercase"]},
  "statements": [
    {"platform": "bilibili", "label": "B站", "account_column": "账号ID",
     "columns": ["日期", "收入类型", "流水(元)", "平台分成(元)", "已代扣个税(元)", "实际到账(元)"],
     "date_column": "日期", "date_format": "%Y/%m/%d",
     "currency": "CNY", "currency_column": null, "ref_column": null},
    {"platform": "freelancer", "label": "Freelancer.com", "account_column": "username",
     "columns": ["date", "project_id", "currency", "project_amount", "entry_type"],
     "date_column": "date", "date_format": "%Y%m%d",
     "currency": null, "currency_column": "currency", "ref_column": "project_id"}
    // … all 8 platforms: bilibili, youtube, twitch, patreon, upwork, fiverr, freelancer, contra
  ],
  "rate_files": [
    {"columns": ["date", "cny_per_usd"], "direction": "CNY per 1 USD", "date_format": "%Y-%m-%d"},
    {"columns": ["date", "<ISO currency code>, …"], "example": ["date", "EUR", "GBP"],
     "direction": "USD per 1 unit", "date_format": "%Y-%m-%d"}
  ],
  "entries": {"fields": ["id", "kind", "date", "amount", "currency", "source", "category"],
              "kinds": ["income", "expense"],
              "expense_categories": ["Software & subscriptions", "Equipment", "Internet & phone", "Education",
                                     "Travel", "Marketing", "Other"],
              "max_label_length": 60, "rules": "income needs source; …"},
  "limits": {"max_files": 40, "max_body_bytes": 4000000, "max_entries": 2000, "max_skipped_rows_listed": 20}
}
```

Notes on the fields:
- `date_format` is a Python strptime pattern. Fiverr's date is a full timestamp.
- The platform's currency is either fixed (`currency`) or read per row (`currency_column`).
- Match a header like this: normalise each header cell, then check that every normalised name in
  `columns` is present. Platforms are tried in the order listed.
- `label` is the ledger label. The UI shows "B站" as "Bilibili".

## Request body (every POST)

```json
{
  "files": [{"name": "bilibili_income.csv", "content": "账号ID,日期,…"},
            {"name": "export.csv", "content_base64": "…"}],
  "tax_home": "US",          // "US" | "CN" | "BOTH"              default "US"
  "currency": "USD",         // "USD" | "CNY" (display)          default "USD"
  "set_aside_rate": 0.25,    // 0–0.6, the user's choice          default 0.25
  "payout_methods": {"fiverr": "PayPal"},   // platform -> method; PayPal sets the duplicate-1099-K flag
  "reference_rates": true,   // false = only uploaded rate files are used
  "month": "2026-09",        // overview, ledger; default = latest month in the files
  "period": "2026-Q3",       // tax-items, forms, report: YYYY-MM | YYYY-Qn | YYYY-MM~YYYY-MM; default = that month's quarter
  "after": "2026-10-17",     // deadlines after this date; default = today
  "entries": [               // manual income and expenses; optional
    {"id": "e-1042", "kind": "income", "date": "2026-09-14", "amount": 900, "currency": "CNY", "source": "Tutoring"},
    {"id": "e-1043", "kind": "expense", "date": "2026-09-02", "amount": 59.99, "currency": "USD",
     "source": "Adobe Creative Cloud", "category": "Software & subscriptions"}
  ],
  "monthly_goal": {"amount": 6000, "currency": "USD"}   // or null; currency "USD" | "CNY"
}
```

`files` can be empty when there are `entries`. A request with neither (or with nothing readable)
returns 422.

### Manual entries

| Field | Rule |
|---|---|
| `id` | text, required, unique in the request (the browser makes it) |
| `kind` | `"income"` or `"expense"` |
| `date` | `YYYY-MM-DD`, from 2000 to today |
| `amount` | number or numeric string, more than 0, at most 2 decimals, at most 10,000,000 |
| `currency` | 3-letter code (`usd` is read as `USD`) |
| `source` | income: required label, up to 60 characters ("Tutoring"). Expense: optional label ("Adobe") |
| `category` | expense only, one of `expense_categories` (case doesn't matter) |

Notes stay in the browser. Any other field is ignored and its value never echoed; only its name
appears in `import.entries.ignored_fields`. Each entry is checked on its own. A bad one is
skipped and listed under `import.entries.rejected` with its `index`, `id` and `reason`, and the
rest still count. Entries convert with exactly the statement rules: rate file first, then ECB,
never estimated. A converted entry carries `rate`, `rate_date` and `source`.

- `content` is the file as text. `content_base64` is its bytes, read as UTF-8 and then GB18030.
- Limits: 1 to 40 files, 4 MB body.
- `/ask` also takes `"question"` (up to 2000 characters).

## Every POST response adds

- `import`: what was read (also the whole `/detect` response).
- `settings`: the settings used, echoed back.

```json
"import": {
  "files": [
    {"file": "bilibili_income.csv", "kind": "statement", "platform": "bilibili", "label": "B站",
     "accounts": ["acct-4821"], "rows": 42, "records": 42, "skipped_rows": 0,
     "skipped": [{"line": 7, "reason": "a date or amount on this row isn't in the statement's usual format"}],
     "first_date": "2026-07-01", "last_date": "2026-09-30", "months": ["2026-07", "2026-08", "2026-09"],
     "currencies": ["CNY"]},
    {"file": "rates.csv", "kind": "rates", "rows": 92, "skipped_rows": 0, "skipped": [],
     "rates": {"CNY": {"days": 91, "first_date": "2026-07-01", "last_date": "2026-09-30", "direction": "CNY per 1 USD"}}},
    {"file": "copy.csv", "kind": "duplicate", "duplicate_of": "bilibili_income.csv", "message": "Same content as another file; counted once.", "rows": 0, "skipped_rows": 0, "skipped": []},
    {"file": "notes.csv", "kind": "unknown", "message": "These columns don't match a statement Side Atlas can read yet. …", "rows": 0, "skipped_rows": 0, "skipped": []}
  ],
  "platforms": [{"platform": "bilibili", "label": "B站", "accounts": ["acct-4821"]}],
  "months": ["2026-07", "2026-08", "2026-09"], "records": 97,
  "rate_sources": {"CNY": "your rate file", "EUR": "ECB reference rate"},
  "rates_note": null,            // a sentence when ECB rates couldn't be loaded
  "overlaps": [{"platform": "Twitch", "files": ["jul-aug.csv", "aug-sep.csv"], "first_shared_date": "2026-08-15",
                "message": "Two files cover some of the same dates for one account. …"}],
  "entries": {"received": 4, "accepted": 3, "income": 2, "expenses": 1,
              "rejected": [{"index": 3, "id": "e-1050", "reason": "date is in the future"}],
              "ignored_fields": ["note"]}
}
```

`kind` is one of `statement`, `rates`, `duplicate`, `unknown` or `empty`. If no file yields a
record, every page endpoint returns 422 with
`{"detail": {"message": "None of these files is a statement Side Atlas can read.", "import": {…}}}`.

## Money, rates and issues

- Keys carry the display currency where a response mixes amounts: `net_usd` or `net_cny`.
  Totals blocks (`totals`, platform rows, `by_month`) are plain `gross`, `platform_fee`,
  `payout_fee`, `withheld` and `net`, in the response's `currency`.
- Every converted record carries its rate:
  ```json
  "fx":     {"currency": "EUR", "rate": 1.1643, "rate_date": "2026-08-28", "source": "ECB reference rate",
             "rule": "USD per 1 EUR (USD = amount × rate)"},
  "fx_cny": {"currency": "CNY", "rate": 6.7208, "rate_date": "2026-08-28", "source": "ECB reference rate",
             "rule": "CNY per 1 USD (CNY = USD × rate)"}
  ```
  - `fx` takes a non-USD record to USD. It is `null` for USD records, and for CNY records when
    the display is CNY.
  - `fx_cny` only appears with `currency: "CNY"`. It is `null` for CNY records, which are shown
    as they are.
  - `source` is `"your rate file"` or `"ECB reference rate"`.
  - When `rate_date` differs from the row's `date`, the ECB published nothing that day. The UI
    shows something like "ECB rate of Fri 28 Aug".
- A record with no rate keeps `"issue": "missing_fx"`, null amounts, and is left out of every
  total. The response has `complete: false` and an entry in `issues`:
  ```json
  {"type": "missing_fx", "currency": "EUR", "date": "2026-08-21", "platform": "Freelancer.com",
   "record": {"type": "Project Payment", "ref": "FL-49196", "currency": "EUR", "amount": 491.33},
   "reason": "not_in_rate_file",
   "message": "Your rate file has no EUR rate for 2026-08-21, so this record is left out of the totals until you add one."}
  ```
  An entry with no rate gets the same issue with `"platform": null` and
  `"entry": {"id", "kind", "label", "currency", "amount"}` in place of `record`. Its row has
  `"issue": "missing_fx"`, and it is left out of every total.

  `reason` is one of:
  - `not_in_rate_file`;
  - `reference_rates_unavailable` (the ECB fetch failed; nothing is used in its place);
  - `reference_rates_off`;
  - `no_reference_rate` (nothing published in the week up to that date).

## Endpoints

| Endpoint | Body uses | Response (plus `import`, `settings`) |
|---|---|---|
| `GET /formats` | | above |
| `POST /detect` | `files` | `import`, `settings` only. No rates are fetched |
| `POST /overview` | `month`, `monthly_goal` | `creator, month, currency, complete, issues, totals, platforms[], best_keep_rate, month_over_month, set_aside`, plus `income_by_source[], manual_income, expenses, expenses_by_category[], kept_after_expenses, goal, badges[]` |
| `POST /ledger` | `month` | `creator, month, currency, complete, issues, rows[], totals, waterfall[]`, plus `entry_rows[], manual_income, expenses, kept_after_expenses` |
| `POST /tax-items` | `period, after` | `creator, period, months, currency, complete, issues, tax_withheld_by_platform[], total_tax_withheld_<cur>, total_net_<cur>, set_aside, next_us_estimated_tax_due, items_for_accountant[], forms, note, tax_home, by_country[], assumptions[]` |
| `POST /forms` | `period` | US in tax home: `creator, period, currency: "USD", months, platforms[], totals_for_platforms_with_forms, platforms_over_1099k_threshold, possible_duplicate_reports, complete, issues, notes, note`. China only: `creator, period, applies: false, note` |
| `POST /report` | `period, after`, `monthly_goal` | `title, creator, period, months, generated_on, currency, complete, issues, totals, waterfall, by_month[], by_platform[], best_keep_rate, fx_used[], tax, assumptions_note, disclaimer` (`tax` as in tax-items), plus `income_by_source[], manual_income, expenses, expenses_by_category[], kept_after_expenses, kept_by_month[], entry_rows[], goal, badges[]` |
| `POST /ask` | `question` + all | Server-sent events, below |

All paths start with `/api/personal`.

Shapes in detail:
- `platforms[]` and `by_platform[]`:
  `{platform, label, gross, platform_fee, payout_fee, withheld, net, net_rate, share_of_net, records, currencies}`.
  Some platforms add more: `native_cny` when there is CNY income, `tips` (Fiverr), and
  `ios_pledges` with `ios_simulation` (Patreon).
- `rows[]`: `{date, month, platform, platform_label, type, ref, original{currency, gross, platform_fee, payout_fee, withheld, net}, fx, [fx_cny], gross_<cur>, platform_fee_<cur>, payout_fee_<cur>, withheld_<cur>, net_<cur>, [issue]}`.
- `month_over_month`: `{previous_month, previous_net, change, change_pct, previous_complete}`.
- `set_aside`: `{rate, amount, base: "net income in USD|CNY", rate_source: "chosen by you"}`.
- `tax_withheld_by_platform[]`: `{platform, country, tax, withheld_<cur>, [withheld_cny]}`.
- `next_us_estimated_tax_due`: `{after, due_date, days_left, schedule[]}`, or `null` when the
  tax home has no US.
- `forms` inside tax-items: the forms response above, or `{applies: false, note}`.
- `by_country[]`, one per country in the tax home (US first):
  ```json
  {"country": "CN", "label": "China", "forms_apply": false,
   "deadlines": [{"id": "cn_annual_reconciliation", "label": "China annual individual income tax filing for 2026",
                  "opens": "2027-03-01", "closes": "2027-06-30", "basis": "real", "source": "…"}],
   "items": [{"text": "Bilibili withheld ¥235.75 of individual income tax. …", "basis": "real", "source": "…"}]}
  ```
  A US deadline is `{id: "us_estimated_tax", label, date, schedule[], basis, source}`.
- `assumptions[]`: `{topic, basis: "real" | "simulated" | "your choice", text}`.
- `fx_used[]`: `{currency, date (the rate's date), rate, source}`. Statements only; each entry
  row carries its own rate.

The new fields are only ever added. Every field the statements produce keeps its value, so
`totals`, `platforms` and the rest are still statements only. The new fields:
- `entry_rows[]`: `{id, date, month, kind: "income" | "expense", manual: true, source, category,
  original{currency, amount}, fx, [fx_cny], amount_<cur>, [issue]}`, sorted by date.
- `income_by_source[]`: `{source, platform (key, or null for manual), manual, income, share,
  records}`. Platform sources give their net; manual sources give the sum of their entries.
  Sorted by income, largest first.
- `manual_income`: `{total, entries, sources}`.
- `expenses`: `{total, entries}`.
- `expenses_by_category[]`: `{category, amount, entries, share}`, in the fixed category order.
- `kept_after_expenses`: `{platform_net, manual_income, expenses, kept, rule}`, where
  kept = platform net + manual income − expenses. Platform fees are already inside platform
  net, so an expense is only something the person entered. Nothing is counted twice.
- `kept_by_month[]` (report): `{month, platform_net, manual_income, expenses, kept, complete}`.
- `goal`: `null` without a `monthly_goal`, otherwise:
  ```json
  {"amount": 6000.0, "currency": "USD", "basis": "income: platform net plus manual income, before expenses",
   "months": [{"month": "2026-09", "income": 6118.33, "progress": 1.0197, "remaining": 0.0, "reached": true,
               "reached_on": "2026-09-28", "complete": true}],
   "months_reached": 1}
  ```
  - Income is shown in the goal's currency.
  - `reached_on` is the day the month's running total reached the goal.
  - `complete: false` means some record that month had no rate.
- `badges[]`: all 8, earned or not, as of the end of the month (overview) or the period's last
  month (report):
  ```json
  {"id": "new_currency", "title_key": "badge.new_currency", "earned": true, "earned_on": "2026-08-12",
   "numbers": {"currency": "EUR", "first_date": "2026-08-12", "earlier_currencies": ["CNY", "USD"]},
   "progress": null}
  ```
  An unearned badge has `earned_on: null` and, where it makes sense,
  `progress: {current, target, unit}`.

### Badge rules

The badges measure income: platform net plus manual income, before expenses. A record with no
rate is left out.
- Fixed amounts (1,000 and 10,000) compare the USD value, whatever the display currency, and
  `numbers` gives both.
- Month-against-month badges use the display currency.
- Months run without gaps from the first month with income. A month with nothing counts as 0.

| id | Earned when | `earned_on` | `numbers` |
|---|---|---|---|
| `first_1k_month` | the first month whose income is at least USD 1,000 | the day that month's running total reached 1,000 | `month, income_usd, threshold_usd, income, currency` |
| `best_month` | a month beat every earlier month (needs at least one earlier month). The latest such month is shown | the day its running total passed the previous best | `month, income, previous_best_month, previous_best, currency` |
| `growth_streak_3` | income rose month over month three times in a row (4 months) | the day the third rising month passed the month before | `months[4], income[4], currency` |
| `new_source` | a platform or manual source first paid after the first month with income | the first such payment | `source, manual, added[{source, manual, first_date}]` |
| `five_sources` | 5 distinct sources have paid (platforms plus manual labels; fee-only rows don't count) | the fifth source's first payment | `fifth, sources[5], count` |
| `new_currency` | a payment in a currency not seen on the first day of income | that payment | `currency, first_date, earlier_currencies` |
| `total_10k` | all income so far reaches USD 10,000 | the day the running total did | `threshold_usd, total_usd` |
| `complete_month` | a month where every platform started by then has records and no record or entry is missing a rate | the month's last record | `month, platforms` |

## `POST /api/personal/ask` (SSE)

| Status | When |
|---|---|
| 503 `{"detail": "Ask Atlas isn't available on this server because it has no model key. …"}` | no model key, as on the public deployment |
| 503 | the server has no PRISM tracing set up |
| 422 | the question is empty or nothing was readable |

Otherwise a `text/event-stream`, with each event's data as JSON:

```
event: step     data: {"i": 1, "type": "llm", "name": "anthropic/claude-opus-5-5", "status": "ok",
                       "tool_calls": ["get_summary"], "text": "", "duration_ms": 2100}
event: step     data: {"i": 2, "type": "tool", "name": "compute_breakdown", "args": {"month": "2026-09"},
                       "status": "ok" | "error", "error": null | "ToolError: MissingFXRate: …",
                       "result_summary": "<first 300 chars>", "result": {…} | null, "duration_ms": 3}
event: answer   data: {"answer": 5341.79 | "Contra" | null, "unit": "USD", "explanation": "…", "text": "<the reply, markdown>"}
event: done     data: {"trace_id": "…", "session_id": "personal-1a2b3c4d", "failed": false, "error": null,
                       "tool_steps": 3, "content_free": true}
event: error    data: {"message": "…"}      (then  event: done  data: {"failed": true})
```

The tools are `get_summary`, `compute_breakdown`, `compare_months`, `tax_items`, `form_check`,
`get_manual_income`, `get_expenses`, `get_goal_progress` and `submit_answer`, and they return
totals only:
- manual income is totalled by the person's source labels;
- expenses are totalled by category, without an expense's own label;
- entry ids, dates and notes never reach the model. `answer: null` means the agent stopped on
missing data. `failed: true` with an answer still means a tool failed along the way. `get_summary` lists
accounts as `acct-NNNN` codes made from a salt that is new on every request, so not even the
browser's labels reach the model.

## Privacy: what the server does

- Stores nothing. No database. Nothing is written to disk. Bodies are JSON, because multipart
  uploads can spool to a temp file.
- Sends `Cache-Control: no-store, max-age=0` and `Pragma: no-cache` on every `/api/personal/*`
  response, errors included.
- Logs nothing from the body. Inputs are never in the URL. Validation errors don't echo the
  input. An unexpected error returns a generic 500 and is logged by its class name only.
- Refuses bodies over 4 MB with 413.
- Makes only these outbound calls:
  - ECB rates: currency codes and a date range;
  - for `/ask`, the model: totals and the question as typed;
  - for `/ask`, PRISM: content-free (steps, tool names, timings, tokens, status, error kind;
    no question, answer, tool input or output).

## What the server can't promise

- Vercel's platform logs record each request's path, time, status and IP.
- The question goes to the model as typed. If it contains a name, the model provider sees it.
- Files in IndexedDB are as safe as the device and browser profile.
- The account label is the browser's job. A file uploaded without relabelling arrives with real
  account names, which the server still keeps away from the model and PRISM.
- An ECB rate is a published reference rate. It isn't the user's bank rate or a tax authority's
  rate (China uses the PBOC central parity rate, see `tax_home.py`).
- The 8 statement formats follow the bundled sample exports. Real platform exports still need
  checking against real files.

## Demo mode

The demo GET endpoints (`/api/overview`, `/api/ledger`, `/api/report`) carry the same new fields,
computed by the same code. Only C01 (Moon Spirit) has entries and a goal, in
`daoshou_testdata/data/manual_entries.json`: fictional, July to September 2026, with a USD 6,000
monthly goal. Every other demo creator has empty entries and `goal: null`. `/api/tax-items`,
`/api/forms`, the 89 graded questions and the PRISM agents don't use entries.

C01, in USD:

| Month | Platform net | Manual income | Expenses | Kept | Goal |
|---|---|---|---|---|---|
| 2026-07 | 5,725.98 | 167.66 | 75.99 | 5,817.65 | 98.2%, not reached |
| 2026-08 | 4,842.39 | 831.00 | 354.99 | 5,318.39 | 94.6%, not reached |
| 2026-09 | 5,341.79 | 776.54 | 204.99 | 5,913.34 | reached on 2026-09-28 |

As of September, 7 badges are earned. `growth_streak_3` is not: August fell.

## Tests

`.venv/bin/python -m pytest -q`, offline. Covers:
- uploads (with the demo rate files) give the demo's numbers for every creator and endpoint, and
  relabelled or column-trimmed files give the same numbers;
- C11's missing EUR rate for 2026-08-21 is still reported;
- the ledger matches `ground_truth_breakdown.csv`, and `check_answers.py` is still 89/89;
- every converted record has a rate, its date and its source;
- an ECB failure becomes an issue, not a crash;
- the privacy behaviour above holds;
- the model sees only totals and 4-digit codes, and PRISM sees no content;
- entries are checked one by one, and every rejection reason is covered;
- entries add fields without changing any statement field, and C01's fixture totals are fixed;
- each badge rule has worked examples, plus goal progress.
