# Side Atlas · 3-minute pitch (EN / 中文)

Deck: 1 cover · 2 problem · 3 demo video (backup) · 4 ledger · 5 tax · 6 failure · 7 PRISM · 8 v1 vs v2 · 9 fix · 10 close.

## 0:00–0:20 · Slides 1–2 · Opening

**EN:** If you earn income across international platforms, your money is split across currencies, platform fees and tax withheld in other countries. Side Atlas is one ledger for global creators and freelancers. We break every transaction into gross income, platform cuts, payout fees and exchange rates, and prepare an accountant-ready set of tax items.

**中文：** 如果你在多个国际平台赚钱，你的钱分散在不同币种、平台抽成和别国代扣的税里。Side Atlas 是给全球创作者和自由职业者用的一本账。我们把每笔收入拆成毛收入、平台抽成、提现费和汇率，整理出可以直接交给会计的税务事项。

## 0:20–1:00 · Live demo (if the network fails, play slide 3)

*(Click Continue to open Overview)*

**EN:** This is Moon Spirit, our fictional New York creator. She earns dollars on Upwork and yuan on Bilibili, which withholds Chinese income tax.

**中文：** 这是 Moon Spirit，我们虚构的纽约创作者。她在 Upwork 赚美元，在 B站赚人民币，B站会代扣中国个税。

*(Ledger → Import statements)*

**EN:** She drops her platform exports here, and Side Atlas detects each platform's format.

**中文：** 她把各平台导出的账单拖进来，Side Atlas 自动识别每个平台的格式。

*(Tax: point at the forms-vs-bank table and the Fiverr flag)*

**EN:** She sets her set-aside rate herself. The forms-versus-bank check flags this Fiverr income paid through PayPal: the same money may appear on two 1099-Ks.

**中文：** 预留比例她自己定。税表和到账的对照会标出这笔经过 PayPal 的 Fiverr 收入：同一笔钱可能出现在两张 1099-K 上。

*(Ask Atlas: show the steps)*

**EN:** When she asks Atlas a question, the AI doesn't do the math. It calls our calculation tools, and every number links back to the step that produced it.

**中文：** 她问 Atlas 问题时，AI 不自己算，而是调用我们的计算工具，每个数字都能追溯到算出它的那一步。

## 1:00–1:30 · Slide 6 · The v1 failure

**EN:** Our first version let the model calculate straight from raw exports. It answered 72 of 81 questions correctly. Six of the nine failures shared one cause: an exchange rate was missing, and the model quietly borrowed a nearby day's rate. In finance, a confident wrong number is worse than an error.

**中文：** 第一版让模型直接从原始账单里算。81 题对了 72 题。错的 9 题里，有 6 题原因相同：缺了某天的汇率，模型就悄悄借用了邻近日期的汇率。在金融里，一个自信的错数字比报错更糟。

## 1:30–2:20 · Slide 7, then switch to PRISM

**EN:** We traced every run in PRISM by Block Convey. Root Cause grouped 11 failed v1 runs, and per-trace analysis rated them critical.

**中文：** 每次运行我们都在 Block Convey 的 PRISM 里留了记录。根因分析把 v1 的 11 次失败归成一类，逐条分析把它们评为“严重”。

*(Open the v1 trace analysis)*

**EN:** Here is the interesting part. PRISM's analysis called v1's arithmetic accurate, because the additions were right. Only our reference-answer check caught the invented exchange rate. We needed both.

**中文：** 有意思的是，PRISM 的分析认为 v1 的算术是对的，因为加法本身没错。只有我们用标准答案核对，才发现汇率是编的。两层检查都需要。

## 2:15–2:25 · Slide 8 · v1 vs v2 (same question)

**EN:** Same question, same data. v1 borrowed the August 20 rate and answered 3,051.80 dollars. v2 stopped at the missing rate and asked for it. PRISM rated the first critical and the second compliant.

**中文：** 同一道题、同一份数据。v1 借用了 8 月 20 日的汇率，答出 3,051.80 美元；v2 在缺汇率的地方停下来，要求补数据。PRISM 给前者打“严重”，给后者打“合规”。

## 2:25–2:45 · Slide 9 · The fix (switch to the Alerts page when you mention the alert)

**EN:** In version two, code does every calculation, and the model only calls the tools and explains the results. When data is missing, the run stops, names the record, and our error-rate alert fires. It fired on a real run at 12.5%, against a 5% threshold. Version two got 9 of 9 on the questions v1 failed, and 89 of 89 on our fictional test set.

**中文：** 第二版里，所有计算都由代码完成，模型只负责调用工具和解释结果。缺数据时，运行会停下，指出是哪一笔，并触发我们的失败率告警，它在一次真实运行中以 12.5% 超过了 5% 的门槛。第二版在 v1 错的 9 题上全对，89 道测试题也全对。

## 2:45–3:00 · Slide 10 · Close

**EN:** Side Atlas gives side earners one ledger they can trust. When it comes to your income and your taxes, every number needs a source, not a confident guess. Thank you.

**中文：** Side Atlas 给副业人一本可以信任的账。说到你的收入和税，每个数字都要有来源，而不是自信地猜一个。谢谢。
