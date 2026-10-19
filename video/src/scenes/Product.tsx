// Scenes 5-10: the real screens. Times are scene-local frames.
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame } from "remotion";
import { C, FONT, MONO, clamp01, easeInOut, prog, s } from "../theme";
import { Key, R, Screen, pad, toFrame } from "../Screen";
import { rect } from "../rects";

const crossfade = (f: number, at: number, len = s(0.3)) => prog(f, at, at + len);

/* 5 · My data: drop the statements, the table fills, platforms are recognised. */
const FILES = ["bilibili_income.csv", "youtube_revenue.csv", "twitch_payouts.csv", "patreon_earnings.csv", "upwork_transactions.csv", "fiverr_earnings.csv", "contra_payments.csv"];
const ICON: Record<string, string> = { bilibili: "bilibili", youtube: "youtube", twitch: "twitch", patreon: "patreon", upwork: "upwork", fiverr: "fiverr", contra: "contra" };

export const MyData: React.FC = () => {
  const f = useCurrentFrame();
  const start: R = [270, 60, 1150, 520];
  const drop = rect("mydata0", ".sa-hero");
  const swap = s(1.7);
  const rows = Array.from({ length: 9 }, (_, i) => rect("mydata", ".sa-table tbody tr", i));
  const target = toFrame(start, drop[0] + drop[2] / 2, drop[1] + drop[3] / 2);
  return (
    <AbsoluteFill>
      <Screen
        src="cap/mydata0.png"
        h={900}
        opacity={1 - crossfade(f, swap)}
        cam={[{ at: 0, r: start }]}
        spot={[{ at: 0, r: drop, o: 0 }, { at: s(0.4), dur: s(0.3), r: drop, o: 1 }, { at: s(1.35), dur: s(0.3), r: drop, o: 0 }]}
      />
      <Screen
        src="cap/mydata.png"
        h={900}
        opacity={crossfade(f, swap)}
        cam={[{ at: 0, r: start }, { at: s(2.6), dur: s(1.0), r: [290, 330, 1110, 520] }, { at: s(5.3), dur: s(1.0), r: [880, 70, 560, 300] }]}
        lifts={[
          { r: rect("mydata", ".sa-hero"), at: swap, pop: true, radius: 24 },
          { r: rect("mydata", ".sa-card", "Import check"), at: swap + s(0.2), pop: true, radius: 24 },
          ...rows.map((r, i) => ({ r, at: swap + s(0.4) + i * s(0.07), bg: C.white, dy: 18 })),
        ]}
        spot={[
          { at: 0, r: [300, 455, 280, 314], o: 0 },
          { at: s(3.6), dur: s(0.4), r: [300, 455, 280, 314], o: 1 },
          { at: s(5.3), dur: s(1.0), r: rect("mydata", ".sa-card", "Import check"), o: 1 },
          { at: s(7.0), dur: s(0.3), r: rect("mydata", ".sa-card", "Import check"), o: 0 },
        ]}
      />
      {FILES.map((name, i) => {
        const a = s(0.25) + i * s(0.1);
        const p = prog(f, a, a + s(0.85), easeInOut);
        if (p <= 0 || p >= 1) return null;
        const sx = 260 + i * 230;
        const sy = 1160;
        const cx = sx;
        const cy = 620;
        const x = (1 - p) * (1 - p) * sx + 2 * (1 - p) * p * cx + p * p * target.x;
        const y = (1 - p) * (1 - p) * sy + 2 * (1 - p) * p * cy + p * p * target.y;
        const shrink = 1 - 0.45 * prog(p, 0.75, 1);
        const key = name.split("_")[0];
        return (
          <div
            key={name}
            style={{
              position: "absolute", left: x, top: y, transform: `translate(-50%, -50%) scale(${shrink}) rotate(${(1 - p) * (i % 2 ? 8 : -8)}deg)`,
              display: "flex", alignItems: "center", gap: 10, padding: "12px 18px", borderRadius: 16, background: C.white,
              boxShadow: "0 16px 40px rgba(60,40,140,.22)", opacity: 1 - prog(p, 0.85, 1), whiteSpace: "nowrap",
            }}
          >
            <Img src={staticFile(`platforms/${ICON[key]}.svg`)} style={{ width: 24, height: 24 }} />
            <span style={{ fontFamily: MONO, fontSize: 19, fontWeight: 600, color: C.ink }}>{name}</span>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/* 6 · Ledger: a yuan row with its rate, the fee column, then the whole ledger. */
export const Ledger: React.FC = () => {
  const row = rect("ledger", ".sa-table tbody tr", 5);
  const fees: R = [1132, 262, 76, 730];
  const kpis = [0, 1, 2, 3].map((i) => rect("ledger", ".sa-card", i)).concat([rect("ledger", ".sa-kpi", 4)]);
  return (
    <Screen
      src="cap/ledger.png"
      h={1500}
      cam={[
        { at: 0, r: [285, 490, 1120, 200] },
        { at: s(1.9), dur: s(1.1), r: [520, 240, 940, 760] },
        { at: s(3.5), dur: s(1.0), r: [255, 60, 1170, 532] },
        { at: s(4.6), dur: s(2.8), r: [255, 300, 1170, 532] },
      ]}
      spot={[
        { at: 0, r: pad(row, 0), o: 0 },
        { at: s(0.35), dur: s(0.4), r: row, o: 1 },
        { at: s(1.9), dur: s(1.1), r: fees, o: 1 },
        { at: s(3.4), dur: s(0.4), r: fees, o: 0 },
      ]}
      lifts={kpis.map((r, i) => ({ r, at: s(3.7) + i * s(0.08), pop: true, radius: 24 }))}
    />
  );
};

/* 7 · Overview: income by source, row by row, then what is kept after expenses. */
export const Overview: React.FC = () => {
  const legend = Array.from({ length: 9 }, (_, i) => rect("overview", ".sa-legend li", i));
  const kept = rect("overview", ".sa-kept");
  const keptLine: R = [986, 646, 381, 34];
  const spot: Key[] = [{ at: 0, r: legend[0], o: 0 }, ...legend.map((r, i) => ({ at: s(0.4) + i * s(0.26), dur: s(0.2), r, o: 1 }))];
  spot.push({ at: s(3.2), dur: s(0.9), r: kept, o: 1 }, { at: s(5.0), dur: s(0.6), r: keptLine, o: 1 }, { at: s(6.8), dur: s(0.3), r: keptLine, o: 0 });
  return (
    <Screen
      src="cap/overview.png"
      h={900}
      cam={[{ at: 0, r: [284, 394, 1120, 485] }, { at: s(3.2), dur: s(1.0), r: [930, 500, 500, 260] }]}
      spot={spot}
    />
  );
};

/* 8 · Tax: the set-aside rate, the estimate, the next payment date. */
export const Tax: React.FC = () => {
  const f = useCurrentFrame();
  const chip = rect("tax", ".rate-chip");
  const amount: R = [312, 172, 250, 60];
  const count = rect("tax", ".tax-count");
  const tap = prog(f, s(1.2), s(1.9));
  return (
    <Screen
      src="cap/tax.png"
      h={1500}
      cam={[{ at: 0, r: [270, 84, 770, 300] }, { at: s(0.2), dur: s(7), r: [300, 96, 700, 280] }]}
      spot={[
        { at: 0, r: chip, o: 0 },
        { at: s(0.4), dur: s(0.4), r: chip, o: 1 },
        { at: s(3.3), dur: s(0.7), r: amount, o: 1 },
        { at: s(4.7), dur: s(0.7), r: count, o: 1 },
        { at: s(6.6), dur: s(0.4), r: count, o: 0 },
      ]}
      top={
        tap > 0 && tap < 1 ? (
          <div
            style={{
              position: "absolute", left: chip[0] + chip[2] / 2 - 40 * tap, top: chip[1] + chip[3] / 2 - 40 * tap, width: 80 * tap, height: 80 * tap,
              borderRadius: "50%", border: `2px solid ${C.white}`, opacity: 1 - tap,
            }}
          />
        ) : null
      }
    />
  );
};

/* 9 · Ask Tilly: type the question, the steps run, the answer links back to its step. */
const QUESTION = "What was my September net income across all platforms?";

export const Ask: React.FC = () => {
  const f = useCurrentFrame();
  const form = rect("ask0", "form");
  const swap = s(2.7);
  const typed = QUESTION.slice(0, Math.round(QUESTION.length * clamp01((f - s(0.3)) / s(1.7))));
  const press = prog(f, s(2.2), s(2.7));
  const b = swap;
  const chip: R = [561, 284, 22, 19];
  const step2 = rect("ask1", ".sa-steps > *", 1);
  const line = prog(f, b + s(2.6), b + s(3.2));
  const steps = [0, 1, 2].map((i) => rect("ask1", ".sa-steps > *", i));
  return (
    <AbsoluteFill>
      <Screen
        src="cap/ask0.png"
        h={900}
        opacity={1 - crossfade(f, swap, s(0.25))}
        cam={[{ at: 0, r: [270, 108, 1150, 300] }]}
        top={
          <>
            <div style={{ position: "absolute", left: form[0] + 16, top: form[1] + 8, width: 540, height: 32, background: C.white }} />
            <div style={{ position: "absolute", left: form[0] + 23, top: form[1] + 13, fontFamily: FONT, fontSize: 15, fontWeight: 500, color: C.ink, whiteSpace: "nowrap" }}>
              {typed}
              <span style={{ display: "inline-block", width: 1.5, height: 18, marginLeft: 1, verticalAlign: "-3px", background: C.violet, opacity: Math.floor(f / 8) % 2 ? 1 : 0.15 }} />
            </div>
            {press > 0 && press < 1 ? (
              <div style={{ position: "absolute", left: 883 - 40 * press, top: 356 - 40 * press, width: 80 * press, height: 80 * press, borderRadius: "50%", border: `2px solid ${C.violet}`, opacity: 1 - press }} />
            ) : null}
          </>
        }
      />
      <Screen
        src="cap/ask1.png"
        h={900}
        opacity={crossfade(f, swap, s(0.25))}
        cam={[{ at: 0, r: [270, 108, 1150, 300] }, { at: b + s(0.2), dur: s(1.1), r: [270, 100, 1150, 760] }, { at: b + s(1.9), dur: s(1.0), r: [300, 170, 1110, 300] }]}
        lifts={[
          { r: rect("ask1", ".sa-bubble"), at: b, dx: 40, dy: 0, radius: 20 },
          ...steps.map((r, i) => ({ r, at: b + s(0.35) + i * s(0.25), bg: C.white, dy: 12 })),
          { r: rect("ask1", ".sa-badge"), at: b + s(1.0), bg: C.white, pop: true, radius: 10 },
          { r: rect("ask1", ".sa-hero"), at: b + s(1.0), pop: true, radius: 24, dy: 30 },
          { r: rect("ask1", ".sa-card", "breakdown"), at: b + s(1.3), radius: 24, dy: 30 },
        ]}
        spot={[{ at: 0, r: chip, o: 0 }, { at: b + s(2.1), dur: s(0.4), r: chip, o: 1 }, { at: b + s(3.0), dur: s(0.7), r: step2, o: 1 }, { at: b + s(4.4), dur: s(0.3), r: step2, o: 0 }]}
        top={
          line > 0 ? (
            <svg style={{ position: "absolute", left: 0, top: 0, width: 1440, height: 900, overflow: "visible", opacity: 1 - prog(f, b + s(4.3), b + s(4.6)) }}>
              <path d={`M ${chip[0] + chip[2] + 4} ${chip[1] + 9} C 760 ${chip[1] - 10}, 880 ${step2[1] + 25}, ${step2[0] - 10} ${step2[1] + 25}`} fill="none" stroke={C.violet} strokeWidth={2.5} pathLength={1} strokeDasharray={1} strokeDashoffset={1 - line} strokeLinecap="round" />
              <circle cx={step2[0] - 10} cy={step2[1] + 25} r={5} fill={C.violet} opacity={prog(line, 0.9, 1)} />
            </svg>
          ) : null
        }
      />
    </AbsoluteFill>
  );
};

/* 10 · Progress: the goal bar fills, Tilly celebrates, then the badges. */
const BADGES: R[] = [285, 569, 853, 1137].flatMap((x, i) => [[x, 270, 266, 252] as R, [x, 540, 266, 237] as R]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);

const Sparkles: React.FC<{ cx: number; cy: number; at: number }> = ({ cx, cy, at }) => {
  const f = useCurrentFrame();
  const p = prog(f, at, at + s(0.9));
  if (p <= 0 || p >= 1) return null;
  return (
    <>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2 + 0.3;
        const d = 30 + 70 * p;
        const size = 14 * (1 - p * 0.6);
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 10 10" style={{ position: "absolute", left: cx + Math.cos(a) * d - size / 2, top: cy + Math.sin(a) * d - size / 2, opacity: 1 - p }}>
            <path d="M5 0 L6.2 3.8 L10 5 L6.2 6.2 L5 10 L3.8 6.2 L0 5 L3.8 3.8 Z" fill={i % 2 ? C.pink : C.violet} />
          </svg>
        );
      })}
    </>
  );
};

export const Progress: React.FC = () => {
  const f = useCurrentFrame();
  const swap = s(2.9);
  const mascot = rect("overview", ".sa-mascot", 1);
  return (
    <AbsoluteFill>
      <Screen
        src="cap/overview.png"
        h={900}
        opacity={1 - crossfade(f, swap)}
        cam={[{ at: 0, r: [880, 70, 560, 280] }, { at: s(0.2), dur: s(3), r: [900, 80, 520, 250] }]}
        covers={[{ r: [973, 198, 310, 16], at: s(0.4), dur: s(1.2), bg: C.pink100, wipe: true }]}
        top={<Sparkles cx={mascot[0] + mascot[2] / 2} cy={mascot[1] + mascot[3] / 2} at={s(1.5)} />}
      />
      <Screen
        src="cap/milestones.png"
        h={1100}
        opacity={crossfade(f, swap)}
        cam={[{ at: 0, r: [270, 80, 1150, 720] }, { at: swap + s(0.3), dur: s(3.4), r: [270, 230, 1150, 580] }]}
        lifts={[{ r: rect("milestones", ".sa-hero"), at: swap, pop: true, radius: 24 }, ...BADGES.map((r, i) => ({ r, at: swap + s(0.2) + i * s(0.09), pop: true, radius: 20 }))]}
      />
    </AbsoluteFill>
  );
};

