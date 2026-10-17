# 到手 Daoshou 测试数据

MONEY TALKS 2 黑客松用的模拟数据。**全部虚构**，人名、账号、金额、费率都是编的，费率是假设值，不代表平台真实规则。

一共 9 个虚构创作者、5 个平台、2026 年 7 到 9 月，加上 64 个带标准答案的问题（61 个算数题 + 3 个告警题）。

## 文件

| 文件 | 内容 |
| --- | --- |
| `data/bilibili_income.csv` | B 站收入，人民币，中文表头，UTF-8 带 BOM |
| `data/youtube_revenue.csv` | YouTube 收入，美元 |
| `data/twitch_payouts.csv` | Twitch 收入，美元 |
| `data/patreon_earnings.csv` | Patreon 月度收入，美元，含 iOS 订阅部分 |
| `data/upwork_transactions.csv` | Upwork 交易，美元，按合同记录 |
| `data/fx_rates_cny_per_usd.csv` | 每日汇率，1 美元 = X 人民币。**故意缺 2026-09-07** |
| `data/creators.json` | 创作者档案：各平台账号、报税国家、预留比例 |
| `data/assumptions.json` | 所有假设费率和计算口径 |
| `data/questions.jsonl` | 64 个问题和标准答案，一行一个 |
| `data/ground_truth_breakdown.csv` | 每个创作者每月每个平台的拆解结果（做看板、对答案用） |
| `tools/generate_testdata.py` | 生成脚本，固定随机种子，每次结果一样 |
| `tools/check_answers.py` | 独立核对脚本，只读 CSV 重新算一遍答案；也可以当 v2 计算逻辑的参考 |

## 5 个平台格式故意不一样

真实导出文件就是这样乱的，这也是 v1 容易出错的地方。

| 平台 | 日期格式 | 账号列 | 特点 |
| --- | --- | --- | --- |
| B 站 | `2026/09/15` | 账号ID | 人民币；月末有一行"提现代扣个税"，实际到账是负数 |
| YouTube | `2026-09-15` | Channel ID | 有美国预扣税列；Leo Park 9 月有一行退款（负数） |
| Twitch | `09/15/2026` | Username | Bits 不抽成，订阅和广告抽成不同 |
| Patreon | `Sep 2026`（按月） | Creator | 抽成和支付手续费分两列；iOS Pledges 是毛收入里的一部分 |
| Upwork | `Sep 5, 2026` | Freelancer | **只给费率不给服务费金额**，要自己算；提现费单独一行 |

读 B 站文件要用 `encoding="utf-8-sig"`，否则第一列表头会带一个看不见的字符。

## 计算口径

- **到手** = 毛收入 − 平台抽成 − 提现/支付费 − 平台已预扣税
- **平台抽成**：B 站平台分成、YouTube Share、Twitch Share、Patreon Fee、Upwork 服务费
- **提现/支付费**：Patreon Payment Processing、Upwork Withdrawal Fee
- **平台已预扣税**：B 站已代扣个税、YouTube US Tax Withheld。单独列，不算抽成
- **换汇**：每笔人民币按它自己日期当天的汇率换成美元（USD = CNY ÷ 汇率）；B 站代扣个税那一行按月末汇率
- **Upwork 服务费**：每笔 = 金额 × 该合同费率，先四舍五入到分再加总
- **到手率** = 到手 ÷ 毛收入（美元口径）
- **应预留税金** = 当月总到手（美元）× 创作者自己设定的预留比例
- **Patreon iOS 模拟**：iOS 订阅毛收入 × 30%（模拟苹果额外抽成）
- **四舍五入**：换算过程保留全部精度，最后才四舍五入到 0.01（ROUND_HALF_UP）

## 虚构创作者

| ID | 名字 | 平台 | 测什么 |
| --- | --- | --- | --- |
| C01 | 月之灵 | B 站、YouTube、Twitch、Patreon、Upwork | Demo 主角；5 个平台全有，每月有代扣个税，7 月没有 Upwork 收入 |
| C02 | 小鹿 | B 站 | 只有中国平台，收入低于起扣线，代扣为 0 |
| C03 | Maya Chen | YouTube、Twitch、Patreon | 只有美国平台 |
| C04 | 阿柚 | B 站、YouTube | YouTube 有美国预扣税 |
| C05 | Leo Park | YouTube、Twitch | 9 月有一笔 Super Chat 退款 |
| C06 | Nina Rossi | Upwork | 5 个合同，费率 0%、5%、10%、12%、15% |
| C07 | 墨白 | B 站、Patreon | 8 月一笔总督 ¥19,998；Patreon iOS 占比高 |
| C08 | Sam Ito | YouTube、Patreon、Upwork | 8 月完全没有收入；YouTube 有美国预扣税 |
| C09 | Kiki | B 站 | 告警测试：9 月有一条记录在缺汇率的 2026-09-07 |

## 问题集 `questions.jsonl`

每行一个问题，主要字段：

- `question`：问题原文（39 个中文，25 个英文）
- `expected_answer` + `unit`：标准答案和单位（USD、CNY 或平台名），金额允许误差 0.01
- `category`：题型，比如 `total_net_usd`、`upwork_contract_fee_usd`、`best_platform`
- `platform` / `contract_id` / `compare_to`：涉及具体平台、合同、对比月份时才有
- `v1_traps`：这题考验 v1 的哪类错误
- 告警题（C09）没有标准答案，`expected_behavior` 写明正确行为：换算步骤报错、触发告警、不编数字

`v1_traps` 标签对应 v1 的预期失败，方便在 PRISM 里看失败聚类：

| 标签 | 意思 | 题数 |
| --- | --- | --- |
| `withholding` | 把预扣税当抽成或漏掉 | 23 |
| `currency` | 人民币当美元 | 19 |
| `upwork_rate` | 所有合同套同一个费率 | 18 |
| `gross_vs_net` | 把毛收入当到手 | 9 |
| `missing_platform` | 漏算某个平台 | 6 |
| `set_aside_base` | 预留基数用错 | 5 |
| `big_single` | 大额单笔 | 5 |
| `fee_classification` | 抽成和提现费分错 | 3 |
| `refund` | 退款没扣掉 | 3 |
| `missing_fx` | 缺汇率时编数字（告警题） | 3 |
| `ios_base` | iOS 模拟基数用错 | 2 |
| `empty_month` | 空月份 | 2 |

## 怎么用来拿 PRISM 证明

1. **Root Cause**：v1 把 64 题全部跑一遍（满足"修复前先跑 50 次以上"），用标准答案判对错，PRISM 里看失败聚类；v2 再跑同一批，全部对上
2. **Alert**：C09 的 3 道题一定会让换算步骤报错，用来展示告警触发
3. **Sessions**：任意一道 C01 的总到手题，v2 都会走完 10 步

## 重新生成和核对

```bash
python3 tools/generate_testdata.py   # 重新生成 data/
python3 tools/check_answers.py       # 独立核对，应显示 64 题全部 match
```
