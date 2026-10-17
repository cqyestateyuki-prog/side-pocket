# Side Atlas — 3-minute demo

## 0:00–0:25 — The problem

**SAY**  
“Your tax form says one thing. Your bank says another. Reddit is full of side earners trying to reconcile the difference. One Fiverr seller reported over twelve thousand dollars in fees across two years, without documentation for tax time. Meanwhile, nothing’s been set aside. Side Atlas starts with one ledger.”

**SHOW**  
Open Overview. Display three pain points: “Forms ≠ deposits,” “Undocumented fees,” and “No tax set-aside.”

## 0:25–1:00 — Moon Spirit’s September

**SAY**  
“This is Moon Spirit, our fictional New York designer. She earns from design gigs and creator platforms. Most pay dollars; Bilibili pays yuan and withholds Chinese income tax.

Here’s her September. Drop platform exports into Import statements. Side Atlas detects each platform.

The ledger separates gross income, platform fees, payout fees, tax withheld, and net. Every currency conversion traces back to that record’s date and exchange rate.”

**SHOW**  
Select September on Overview. Open Ledger → Import statements; show platform-specific download guidance and drop multiple exports. Expand a Bilibili record to reveal its breakdown and dated exchange rate. Keep “Fictional demo data” visible.

## 1:00–1:30 — Tax, without pretending to be a tax adviser

**SAY**  
“Now the tax layer. Moon chooses her set-aside rate—we don’t suggest one. Here’s the countdown to the next US estimated-tax date.

Forms versus bank explains the gap: platform fees, payout fees, tax withheld, and refunds. This flag warns that Fiverr income paid through PayPal could appear twice.

These form types are simulated assumptions. This is preparation for her accountant, not a tax-owed calculation.”

**SHOW**  
Open Tax. Highlight the editable rate, countdown, itemised reconciliation, and possible-duplicate flag. Show “Export for my accountant” and the disclaimer: “Estimate only — not tax, legal, or financial advice.”

## 1:30–2:00 — The failure that changed the build

**SAY**  
“Our first version gave the model raw exports and let it calculate. It answered seventy-two of eighty-one questions correctly.

But six failures shared one cause: an exchange rate was missing. The model silently borrowed a nearby day’s rate and returned a confident number.

The arithmetic could look right while the answer was wrong. It had filled a missing fact with a guess.”

**SHOW**  
Open a recorded v1 Ask Atlas run. Highlight the missing dated rate, the substituted rate, and the reference-answer mismatch.

## 2:00–2:30 — What PRISM caught—and what it didn’t

**SAY**  
“We traced every run in PRISM. Root Cause grouped eleven failed v1 runs.

On the same missing-rate inputs, per-trace analysis rated v1 CRITICAL and v2 LOW: v2 refused to calculate.

But here’s the telling detail. PRISM’s AI also called v1’s arithmetic accurate. Only our independent reference-answer check caught the invented rate. Tracing explains behaviour; reference checks test answers. We needed both.”

**SHOW**  
Show PRISM’s eleven-run v1 cluster. Compare CRITICAL v1 and LOW v2 traces, then highlight “arithmetic accurate” beside the reference-check failure.

## 2:30–2:50 — The fix

**SAY**  
“In v2, code does every calculation. AI orchestrates and explains. Missing data stops the run, names the record, and triggers a failed-run alert.

V2 passed all nine questions v1 failed, and eighty-nine out of eighty-nine overall on our fictional test set.”

**SHOW**  
Show the explicit missing-rate error and PRISM alert rule. Display test results: **9/9 previous failures · 89/89 full set**.

## 2:50–3:00 — Close

**SAY**  
“Side Atlas: one ledger for global side income. Every number needs a source—not a confident guess.”

**SHOW**  
Return to Overview with Atlas waving. End on: **Every number needs a source.**