### 0:00-0:12 · Slide 1 · Opening
**Do:** Show the cover.

**EN:** We built Side Atlas for people earning side income across global platforms. We bring that income into one ledger, with a tax layer on top.

**中文：** 我们做的 Side Atlas，面向通过全球平台赚取副业收入的人。我们把这些收入汇总到一本账里，再加上一层税务整理功能。

### 0:12-0:39 · Slide 2 · The problem
**Do:** Show the Reddit pain points.

**EN:** A 1099-K reports gross income, including the platform’s own fee. PayPal can report the same money again. One Fiverr seller reported over twelve thousand dollars in fees across two years, without documentation.

US platforms withhold nothing for US persons. Quarterly estimated taxes then come as a surprise. These are real complaints from Reddit, and they shaped what we built.

**中文：** 1099-K 报的是总收入，里面包含平台自己收取的手续费。PayPal 还可能把同一笔钱再报一次。一位 Fiverr 卖家说，两年支付的手续费超过一万两千美元，却没有相应凭证。

美国平台不会为美国税务人士预扣税款，所以很多人直到要缴季度预估税时才措手不及。这些都是 Reddit 上真实的抱怨，也是我们设计产品的出发点。

### 0:39-1:22 · Live demo · Overview to Ask Atlas
**Do:** Open side-atlas.vercel.app, click Continue. Follow Overview → Ledger → Import statements → Tax → Ask Atlas. Use slide 3’s backup video only if needed.

**EN:** Meet Moon Spirit, our fictional New York designer. In September, five thousand three hundred forty-one dollars and seventy-nine cents landed, from seven thousand four hundred seventy-one dollars and seven cents gross.

Here’s her ledger. We can drop multiple statements here; Side Atlas detects each platform.

On Tax, she chooses her set-aside rate. Forms versus bank explains the gap. Fiverr paid through PayPal gets a possible-duplicate flag.

In Ask Atlas, we watch the tool steps live. Every number in the answer links to the step that produced it.

**中文：** 这是 Moon Spirit，我们虚构的一位纽约设计师。九月，她的总收入是 7,471.07 美元，实际到账 5,341.79 美元。

这是她的账本。我们可以一次拖入多个账单文件，Side Atlas 会自动识别各自的平台。

在 Tax 页面，她自己选择预留税款的比例。“税表与到账对比”会解释差额。Fiverr 通过 PayPal 付款的情况，会被标记为可能重复申报。

在 Ask Atlas，我们可以实时看到工具执行步骤。回答里的每个数字，都链接到生成它的那一步。

### 1:22-1:39 · Slides 4-5 · Ledger and tax items
**Do:** Return to slide 4, then advance to slide 5.

**EN:** We separate tax withheld from fees. Each currency conversion uses that record’s dated rate. We also provide an accountant checklist and export.

Form types here are simulated assumptions. This demo uses fictional data, with no live connections.

**中文：** 我们把已预扣税款和手续费分开列出。每笔外币换算都使用对应记录日期的汇率。我们还提供给会计师的核对清单和导出报告。

这里的税表类型是模拟假设。演示使用虚构数据，没有连接真实平台或银行。

### 1:39-1:55 · Slide 6 · The failure
**Do:** Show the v1 results.

**EN:** Version one got seventy-two of eighty-one answers right. Six failures shared one cause: a missing exchange rate. The model borrowed a nearby day’s rate and gave us a confident number. That was invented data.

**中文：** 第一版答对了 81 道题中的 72 道。其中六次失败的原因相同：缺少对应日期的汇率。模型借用了相邻日期的汇率，然后很自信地给出结果。这就是编造数据。

### 1:55-2:33 · Slide 7 · PRISM proofs
**Do:** Show slide 7. Switch through PRISM’s Root Cause, v1 trace analysis, then Alerts tabs.

**EN:** PRISM traces every run. Sessions shows seventeen steps in one version-two run.

Root Cause clustered eleven failed version-one runs. The judge agreed. On the same inputs, PRISM rated version one critical and version two low.

Here’s the alert: it fired on a real run at twelve point five percent, against a five percent threshold.

There’s an important limit here. PRISM’s AI called version one’s arithmetic accurate. Only our reference-answer check caught the invented exchange rate. We need both checks.

**中文：** PRISM 会追踪每次运行。在 Sessions 中，第二版的一次运行展示了十七个步骤。

Root Cause 把第一版的十一次失败运行归成了一组，评估器也认可这个判断。面对相同输入，PRISM 将第一版评为 CRITICAL，第二版评为 LOW。

这里是告警：一次真实运行中的错误率达到 12.5%，超过了 5% 的阈值，触发了告警。

但这里有一个重要局限。PRISM 的 AI 曾认为第一版的算术是准确的。只有我们的参考答案校验发现了编造的汇率。这两层检查都需要。

### 2:33-2:50 · Slide 8 · The fix
**Do:** Return to the deck and show the v2 results.

**EN:** We moved every calculation into code. The model orchestrates and explains. Version two got nine of nine on version one’s failures, and eighty-nine of eighty-nine overall.

Missing data now stops the run, names the record and fires the alert.

**中文：** 我们把所有计算都交给代码，模型负责调度和解释。第一版答错的九道题，第二版全部答对；完整测试集的 89 道题也全部答对。

现在，只要缺少数据，运行就会停止，明确指出是哪条记录，并触发告警。

### 2:50-3:00 · Slide 9 · Close
**Do:** Show the closing slide. Pause before the final sentence.

**EN:** We help prepare tax items; we don’t calculate tax owed. Estimate only, not tax, legal, or financial advice.

Every number needs a source, not a confident guess.

**中文：** 我们帮助整理税务事项，不计算应缴税额。结果仅供估算，不构成税务、法律或财务建议。

每个数字都需要有据可查，不能靠自信地猜测。