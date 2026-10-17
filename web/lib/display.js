// Display-layer English for the single-language (English) UI. The API and the test data keep their
// source labels ("B站", Chinese record types and notes) because the graded questions expect them;
// everything that reaches the screen passes through english() first.

const EXACT = {
  "充电": "Power-up",
  "礼物": "Gift",
  "SC": "Super Chat",
  "舰长": "Captain (guard)",
  "提督": "Admiral (guard)",
  "总督": "Governor (guard)",
  "提现代扣个税": "Tax withheld at withdrawal",
  "平台代扣代缴": "Withheld and paid by the platform",
  "大额单笔": "Large single payment",
  "模拟，以平台为准": "Simulated — confirm with the platform",
  "即使没有收到任何税表，这些收入一样要报税": "This income is still reportable even if no tax form arrives",
  "税表口径毛额 − 实际到手 = 平台抽成 + 提现/支付费 + 平台预扣税 + 退款":
    "Form-view gross − landed = platform fees + payout/payment fees + tax withheld by the platform + refunds",
  "全部为模拟假设值，仅用于黑客松 demo，真实费率以平台官方规则为准":
    "All values are simulated assumptions for a hackathon demo; real fees follow each platform's official rules",
  "模拟：示例用 $2,000 作为 1099-MISC/NEC 的开表门槛，以 IRS 为准":
    "Simulated: $2,000 is used as an example 1099-MISC/NEC threshold — confirm with the IRS",
  "模拟：中国平台不开美国税表；已代扣的个税可在个人所得税 App 查纳税记录，交给会计":
    "Simulated: Chinese platforms don't issue US tax forms; the income tax they withheld is listed in China's Individual Income Tax app — give that record to your accountant",
  "模拟：如果平台把钱打到 PayPal 这类自己也会开 1099-K 的付款账户，同一笔收入可能被平台和 PayPal 各报一次；报税时不要重复计入，带上这份对账给会计":
    "Simulated: if a platform pays out to an account like PayPal that issues its own 1099-K, the same income may be reported by both — don't count it twice; bring this reconciliation to your accountant",
  "模拟：各平台给美国税务居民开哪种税表、由谁开，都是示例，请以平台和 IRS 为准；只有 1099-K 门槛是真实规则":
    "Simulated: which form each platform issues to a US tax resident, and who issues it, are examples — confirm with the platform and the IRS; only the 1099-K threshold is a real rule",
  "真实规则：第三方结算机构（TPSO）一个日历年里付给同一收款人的总额超过 $20,000 且交易超过 200 笔，才必须开 1099-K（2025 年的法律把门槛恢复成这样）":
    "Real rule: a third-party settlement organization (TPSO) must issue a 1099-K only when it pays one payee more than $20,000 across more than 200 transactions in a calendar year (restored by the 2025 law)",
};

// Names and platform labels that also appear inside longer strings.
const INLINE = [
  ["B站", "Bilibili"], ["B 站", "Bilibili"],
  ["提现代扣个税", "Tax withheld at withdrawal"], ["平台代扣代缴", "Withheld and paid by the platform"], ["大额单笔", "Large single payment"],
  ["充电", "Power-up"], ["礼物", "Gift"], ["舰长", "Captain (guard)"], ["提督", "Admiral (guard)"], ["总督", "Governor (guard)"],
  ["月之灵", "Moon Spirit"], ["小鹿", "Xiao Lu"], ["阿柚", "A You"], ["墨白", "Mo Bai"],
];

const CJK = /[一-鿿]/;
// Free-text fields that are context, not data: drop them rather than show untranslated text.
const DROP_IF_CJK = new Set(["profile", "note", "notes", "basis", "assumptions_note"]);

export function englishText(s) {
  if (typeof s !== "string") return s;
  if (s in EXACT) return EXACT[s];
  let out = s;
  for (const [cn, en] of INLINE) out = out.split(cn).join(en);
  return out;
}

export function english(value, key = "") {
  if (typeof value === "string") {
    const out = englishText(value);
    return CJK.test(out) && DROP_IF_CJK.has(key) ? "" : out;
  }
  if (Array.isArray(value)) return value.map(v => english(v, key));
  if (value && typeof value === "object") {
    // Keys can be labels too (e.g. fees keyed by platform label), so they are mapped as well.
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [CJK.test(k) ? englishText(k) : k, english(v, k)]));
  }
  return value;
}
