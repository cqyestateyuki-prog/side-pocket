// Scenes 1-4: the problem told with Moon Spirit's real September records, then the product.
import React from "react";
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, MONO, clamp01, easeOut, prog, s } from "../theme";
import { Screen } from "../Screen";

const money = (v: number) => v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* 1 · Payouts arrive from seven places (ledger rows for September). */
const PAYOUTS = [
  { p: "fiverr", name: "Fiverr", what: "Order FO853419", when: "Sep 1", amt: "+$209.80" },
  { p: "patreon", name: "Patreon", what: "September pledges", when: "Sep 1", amt: "+$647.43" },
  { p: "bilibili", name: "Bilibili", what: "Power-up", when: "Sep 3", amt: "+¥1,192.00" },
  { p: "twitch", name: "Twitch", what: "Ad revenue", when: "Sep 5", amt: "+$56.65" },
  { p: "upwork", name: "Upwork", what: "Hourly · UW-2102", when: "Sep 8", amt: "+$398.90" },
  { p: "youtube", name: "YouTube", what: "Channel memberships", when: "Sep 28", amt: "+$522.47" },
  { p: "contra", name: "Contra", what: "App onboarding screens", when: "Sep 28", amt: "+$940.86" },
];

export const Payouts: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = (i: number) => s(0.1) + i * s(0.26);
  const sp = (i: number) => spring({ frame: f - at(i), fps, config: { damping: 18, stiffness: 190, mass: 0.8 } });
  const zoom = 1 + 0.035 * prog(f, 0, s(2.7));
  return (
    <AbsoluteFill style={{ transform: `scale(${zoom})`, transformOrigin: "50% 60%" }}>
      {PAYOUTS.map((it, i) => {
        const p = sp(i);
        if (p <= 0.001) return null;
        let below = 0;
        for (let j = i + 1; j < PAYOUTS.length; j++) below += sp(j);
        const y = 276 + below * 102;
        return (
          <div
            key={it.p}
            style={{
              position: "absolute", left: 540, top: y, width: 840, height: 86, borderRadius: 24, background: C.white,
              boxShadow: "0 1px 2px rgba(24,33,27,.06), 0 14px 36px rgba(60,40,140,.10)", display: "flex", alignItems: "center",
              padding: "0 28px", gap: 20, fontFamily: FONT, opacity: clamp01(p * 1.4) * (1 - below * 0.06),
              transform: `translateY(${(1 - p) * -30}px) scale(${0.94 + 0.06 * p})`,
            }}
          >
            <div style={{ width: 54, height: 54, borderRadius: 16, background: C.violet100, display: "grid", placeItems: "center" }}>
              <Img src={staticFile(`platforms/${it.p}.svg`)} style={{ width: 30, height: 30 }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 25, fontWeight: 700, color: C.ink }}>{it.name}</div>
              <div style={{ fontSize: 19, fontWeight: 500, color: C.meta }}>{it.what} · {it.when}</div>
            </div>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.violet, fontVariantNumeric: "tabular-nums" }}>{it.amt}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* 2 · Seven statements, seven formats (headers and rows from web/demo/samples). */
const SHEETS = [
  { f: "bilibili_income.csv", p: "bilibili", head: "账号ID,日期,收入类型,流水(元),平台分成(元),已代扣个税(元),实际到账(元)",
    rows: ["bili_330121,2026/09/03,充电,1192.00,596.00,0.00,596.00", "bili_330121,2026/09/09,提督,1998.00,999.00,0.00,999.00"],
    hl: ["2026/09/03", "已代扣个税(元)"], x: 120, y: 292, rot: -4.5, dx: -1100, dy: 0 },
  { f: "upwork_transactions.csv", p: "upwork", head: "Freelancer,Date,Type,Contract ID,Client,Amount (USD),Service Fee Rate",
    rows: ['moonspirit_design,"Sep 8, 2026",Hourly,UW-2102,Hollow Pine Games,398.90,15%', 'moonspirit_design,"Sep 14, 2026",Fixed Price,UW-2101,Lumen Studio,634.28,10%'],
    hl: ['"Sep 8, 2026"', "Service Fee Rate"], x: 1150, y: 268, rot: 4, dx: 1100, dy: 0 },
  { f: "youtube_revenue.csv", p: "youtube", head: "Channel ID,Date,Revenue Type,Gross Revenue (USD),YouTube Share (USD),US Tax Withheld (USD)",
    rows: ["UC-yzl-moonspirit,2026-09-19,Super Chat,234.78,70.43,0.00", "UC-yzl-moonspirit,2026-09-28,Channel Memberships,522.47,156.74,0.00"],
    hl: ["2026-09-19", "YouTube Share (USD)"], x: 640, y: 420, rot: -1.5, dx: 0, dy: 900 },
  { f: "patreon_earnings.csv", p: "patreon", head: "Creator,Month,Patrons,Gross Pledges (USD),iOS Pledges (USD),Patreon Fee (USD),Payment Processing (USD)",
    rows: ["yuezhiling,Sep 2026,93,647.43,228.30,51.79,19.42"], hl: ["Sep 2026", "Payment Processing (USD)"], x: 150, y: 640, rot: 3.5, dx: -1100, dy: 200 },
  { f: "twitch_payouts.csv", p: "twitch", head: "Username,Date,Revenue Type,Gross (USD),Twitch Share (USD),Payout (USD)",
    rows: ["yuezhiling_tv,09/01/2026,Bits,65.43,0.00,65.43", "yuezhiling_tv,09/05/2026,Ad Revenue,56.65,25.49,31.16"],
    hl: ["09/01/2026", "Twitch Share (USD)"], x: 1160, y: 610, rot: -3.5, dx: 1100, dy: 200 },
  { f: "fiverr_earnings.csv", p: "fiverr", head: "Seller,Completed At (UTC),Order ID,Item,Buyer,Amount (USD)",
    rows: ["moonspirit_studio,2026-09-01T09:32:00Z,FO853419,Order,nordbyte,209.80", "moonspirit_studio,2026-09-01T09:32:00Z,FO853419,Tip,nordbyte,14.81"],
    hl: ["2026-09-01T09:32:00Z"], x: 560, y: 760, rot: 2, dx: 0, dy: 900 },
  { f: "contra_payments.csv", p: "contra", head: "Profile,Paid On,Client,Project,Amount",
    rows: ['moonspirit,"September 28, 2026",Paperplane,App onboarding screens,$940.86'], hl: ['"September 28, 2026"'], x: 1240, y: 830, rot: 5.5, dx: 900, dy: 700 },
];

const Marked: React.FC<{ text: string; hl: string[] }> = ({ text, hl }) => {
  const parts: React.ReactNode[] = [];
  let rest = text;
  let k = 0;
  while (rest.length) {
    const hits = hl.map((h) => [rest.indexOf(h), h] as const).filter(([i]) => i >= 0).sort((a, b) => a[0] - b[0]);
    if (!hits.length) { parts.push(rest); break; }
    const [i, h] = hits[0];
    parts.push(rest.slice(0, i));
    parts.push(<span key={k++} style={{ background: C.pink100, color: C.pinkText, borderRadius: 5, padding: "1px 3px" }}>{h}</span>);
    rest = rest.slice(i + h.length);
  }
  return <>{parts}</>;
};

export const Statements: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = f / fps;
  return (
    <AbsoluteFill>
      {SHEETS.map((sh, i) => {
        const p = spring({ frame: f - s(0.05) - i * s(0.15), fps, config: { damping: 20, stiffness: 160, mass: 0.9 } });
        const wob = Math.sin(t * 0.9 + i * 1.7) * 0.7;
        return (
          <div
            key={sh.f}
            style={{
              position: "absolute", left: sh.x, top: sh.y, width: 660, borderRadius: 18, background: C.white, overflow: "hidden",
              boxShadow: "0 1px 2px rgba(24,33,27,.06), 0 20px 50px rgba(60,40,140,.14)", opacity: clamp01(p * 2),
              transform: `translate(${(1 - p) * sh.dx}px, ${(1 - p) * sh.dy + Math.sin(t + i) * 4}px) rotate(${sh.rot + wob}deg)`,
            }}
          >
            <div style={{ height: 46, display: "flex", alignItems: "center", gap: 10, padding: "0 18px", borderBottom: `1px solid ${C.line}`, background: "#FBFAFE" }}>
              <Img src={staticFile(`platforms/${sh.p}.svg`)} style={{ width: 20, height: 20 }} />
              <span style={{ fontFamily: MONO, fontSize: 16, fontWeight: 600, color: C.ink }}>{sh.f}</span>
            </div>
            <div
              style={{
                padding: "14px 18px 16px", fontFamily: MONO, fontSize: 15, lineHeight: 1.75, whiteSpace: "nowrap",
                WebkitMaskImage: "linear-gradient(to right, black 82%, transparent)", maskImage: "linear-gradient(to right, black 82%, transparent)",
              }}
            >
              <div style={{ color: C.ink, fontWeight: 600 }}><Marked text={sh.head} hl={sh.hl} /></div>
              {sh.rows.map((r) => (
                <div key={r} style={{ color: C.meta }}><Marked text={r} hl={sh.hl} /></div>
              ))}
            </div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* 3 · Gross to net for September, seven platforms (Ask Tilly's breakdown). The net bar is a question. */
const BARS = [
  { label: "Gross", v: 7471.07, color: C.violet, sign: "" },
  { label: "Platform fees", v: 2095.46, color: C.fee, sign: "−" },
  { label: "Payout fees", v: 24.42, color: C.payout, sign: "−" },
  { label: "Tax withheld", v: 9.4, color: C.pinkText, sign: "−" },
];

export const Breakdown: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const base = 860;
  const max = 430;
  const hOf = (v: number) => (max * v) / 7471.07;
  const bw = 176;
  const gap = 86;
  const x0 = (1920 - (5 * bw + 4 * gap)) / 2;
  const starts = [s(0.15), s(0.55), s(0.8), s(1.0)];
  let top = base - max;
  const bars = BARS.map((b, i) => {
    const h = Math.max(4, hOf(b.v));
    const y = i === 0 ? base - h : top;
    if (i > 0) top += hOf(b.v);
    return { ...b, h, y, x: x0 + i * (bw + gap), at: starts[i] };
  });
  const netH = hOf(5341.79);
  const netP = prog(f, s(1.3), s(1.8), easeOut);
  const q = spring({ frame: f - s(1.7), fps, config: { damping: 11, stiffness: 160 } });
  const label = (x: number, text: string, o: number) => (
    <div style={{ position: "absolute", left: x - 20, width: bw + 40, top: base + 22, textAlign: "center", fontFamily: FONT, fontSize: 22, fontWeight: 600, color: C.meta, opacity: o }}>{text}</div>
  );
  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: x0 - 40, right: x0 - 40, top: base, height: 2, background: C.lineStrong }} />
      {bars.map((b, i) => {
        const p = prog(f, b.at, b.at + s(0.45), easeOut);
        const shown = i === 0 ? b.v * p : b.v;
        return (
          <React.Fragment key={b.label}>
            <div
              style={{
                position: "absolute", left: b.x, width: bw, top: i === 0 ? base - b.h * p : b.y, height: b.h * p, background: b.color,
                borderRadius: 10,
              }}
            />
            {i > 0 ? (
              <div style={{ position: "absolute", left: b.x - gap, width: gap, top: b.y, borderTop: `2px dashed ${C.lineStrong}`, opacity: p }} />
            ) : null}
            <div
              style={{
                position: "absolute", left: b.x - 40, width: bw + 80, top: (i === 0 ? base - b.h * p : b.y) - 50, textAlign: "center",
                fontFamily: FONT, fontSize: 30, fontWeight: 800, color: i === 0 ? C.ink : b.color, fontVariantNumeric: "tabular-nums", opacity: clamp01(p * 2),
              }}
            >
              {b.sign}${money(shown)}
            </div>
            {label(b.x, b.label, clamp01(p * 2))}
          </React.Fragment>
        );
      })}
      {(() => {
        const x = x0 + 4 * (bw + gap);
        return (
          <>
            <div style={{ position: "absolute", left: x - gap, width: gap, top: base - netH, borderTop: `2px dashed ${C.lineStrong}`, opacity: netP }} />
            <div
              style={{
                position: "absolute", left: x, width: bw, top: base - netH * netP, height: netH * netP, borderRadius: 10,
                border: `3px dashed ${C.violet}`, background: "rgba(107,91,194,0.07)", boxSizing: "border-box",
              }}
            />
            <div
              style={{
                position: "absolute", left: x, width: bw, top: base - netH / 2 - 80, textAlign: "center", fontFamily: FONT, fontSize: 150,
                fontWeight: 800, color: C.violet, opacity: clamp01(q * 1.5), transform: `scale(${0.6 + 0.4 * q + 0.03 * Math.sin(f / 6)})`,
              }}
            >
              ?
            </div>
            {label(x, "Net", netP)}
          </>
        );
      })()}
      <div style={{ position: "absolute", left: 0, right: 0, top: base + 74, textAlign: "center", fontFamily: FONT, fontSize: 20, fontWeight: 600, color: C.meta, opacity: prog(f, s(0.3), s(0.7)) }}>
        Moon Spirit · September 2026 · 7 platforms
      </div>
    </AbsoluteFill>
  );
};

/* 4 · The product: logo, then Overview rises into place. */
export const Reveal: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const icon = spring({ frame: f - s(0.1), fps, config: { damping: 12, stiffness: 150 } });
  const word = prog(f, s(0.3), s(0.9), easeOut);
  const away = prog(f, s(1.7), s(2.3));
  const rise = prog(f, s(1.8), s(3.0), easeOut);
  return (
    <AbsoluteFill>
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 470, display: "flex", justifyContent: "center", alignItems: "center", gap: 30,
          opacity: 1 - away, transform: `translateY(${-80 * away}px) scale(${1 - 0.1 * away})`,
        }}
      >
        <Img
          src={staticFile("logo.png")}
          style={{
            width: 150, height: 150, borderRadius: 36, boxShadow: "0 20px 50px rgba(70,50,150,.25)",
            transform: `scale(${0.5 + 0.5 * icon}) rotate(${(1 - icon) * -10}deg)`, opacity: clamp01(icon * 2),
          }}
        />
        <div
          style={{
            fontFamily: FONT, fontSize: 96, fontWeight: 800, letterSpacing: "-0.03em", color: C.ink,
            clipPath: `inset(0 ${(1 - word) * 100}% 0 0)`, transform: `translateX(${(1 - word) * -24}px)`,
          }}
        >
          Side Pocket
        </div>
      </div>
      <AbsoluteFill
        style={{
          opacity: rise, transformOrigin: "50% 100%",
          transform: `perspective(2200px) translateY(${(1 - rise) * 420}px) rotateX(${(1 - rise) * 22}deg) scale(${0.92 + 0.08 * rise})`,
        }}
      >
        <Screen src="cap/overview.png" h={900} cam={[{ at: 0, r: [0, 0, 1440, 900] }, { at: s(2.9), dur: s(1.6), r: [150, 0, 1290, 840] }]} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
