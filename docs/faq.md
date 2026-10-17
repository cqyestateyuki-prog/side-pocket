## FAQ

### What is it built with?

We built Side Atlas with Python and FastAPI on Vercel, plus a plain HTML, CSS and JavaScript front end with design tokens. Our hand-written tool-calling agent runs on Claude Opus 5.5 through the Nicrron API, which handles all model calls; early traced runs used Claude Fable 5.1. We used GPT-6 Astra for product copy and Google nano-banana-pro for the mascot. We calculate every amount in plain Python with Decimal, trace every run with PRISM by Block Convey, and test against 89 questions with reference answers and an independent checker.

### How do I know the AI is right?

Our AI does not produce the numbers: code computes every amount the same way every time, and every number in an answer links to the step that produced it. We show the original amount, currency, exchange rate and rate date on every ledger row so you can check it against your own platform export. When data is missing, we stop and name the affected record instead of guessing. Our v2 answered 89 of 89 test questions correctly against reference answers, and we trace every run in PRISM with alerts on failures.

### Is this tax advice?

No. We organise tax items and prepare an export for your accountant; you choose the set-aside rate. We do not calculate tax owed or judge tax residency. Estimate only. Not tax, legal, or financial advice.

### Is the data real?

We use fictional creators and data in the demo. We use the real 1099-K threshold and the real Fiverr, Upwork, Freelancer.com and Contra fee rules. We simulate and label other fee and form assumptions.