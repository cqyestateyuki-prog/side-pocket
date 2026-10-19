// Portfolio cover: the film's question on the left, the live Overview on the right.
// Laid out on 1920×1080; taller canvases (16:10) centre the same layout vertically.
import React from "react";
import { AbsoluteFill, Img, staticFile, useVideoConfig } from "remotion";
import { C, FONT } from "./theme";

const PLATFORMS = ["upwork", "fiverr", "freelancer", "contra", "youtube", "twitch", "patreon", "bilibili"];

const META = [
  ["Role", "Founder & product designer"],
  ["Event", "MONEY TALKS Hackathon"],
  ["Built with", "Claude Code · FastAPI"],
];

export type CoverProps = { l1: string; l2: string; sub: string };

export const COVER: CoverProps = {
  l1: "The easy way to track",
  l2: "your side income.",
  sub: "Statements from 8 platforms, with every fee and currency shown.",
};

/** The Overview capture is 1440×900 CSS px at 2x; the window shows it at this scale. */
const SCALE = 0.84;
const WIN = { x: 960, y: 168, chrome: 34 };

const Payout: React.FC<{ p: string; name: string; amt: string; x: number; y: number }> = ({ p, name, amt, x, y }) => (
  <div
    style={{
      position: "absolute", left: x, top: y, height: 76, padding: "0 26px 0 14px", borderRadius: 22, background: C.white,
      display: "flex", alignItems: "center", gap: 16, fontFamily: FONT,
      boxShadow: "0 1px 2px rgba(24,33,27,.06), 0 18px 40px rgba(60,40,140,.16)",
    }}
  >
    <div style={{ width: 48, height: 48, borderRadius: 14, background: C.violet100, display: "grid", placeItems: "center" }}>
      <Img src={staticFile(`platforms/${p}.svg`)} style={{ width: 26, height: 26 }} />
    </div>
    <span style={{ fontSize: 22, fontWeight: 700, color: C.ink }}>{name}</span>
    <span style={{ fontSize: 26, fontWeight: 800, color: C.violet, fontVariantNumeric: "tabular-nums" }}>{amt}</span>
  </div>
);

export const Cover: React.FC<CoverProps> = ({ l1, l2, sub }) => {
  const { height } = useVideoConfig();
  // Largest size that keeps the longer line clear of the window; the block sits on the same baseline.
  const size = Math.min(100, Math.floor(790 / (Math.max(l1.length, l2.length) * 0.49)));
  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden", fontFamily: FONT }}>
      <div style={{ position: "absolute", width: 1400, height: 1400, borderRadius: "50%", left: -520, top: -640, background: "radial-gradient(circle, rgba(107,91,194,0.18), rgba(107,91,194,0) 64%)" }} />
      <div style={{ position: "absolute", width: 1300, height: 1300, borderRadius: "50%", left: 1180, top: 260 + height - 1080, background: "radial-gradient(circle, rgba(255,122,182,0.2), rgba(255,122,182,0) 64%)" }} />
      <div style={{ position: "absolute", left: 0, top: (height - 1080) / 2, width: 1920, height: 1080 }}>
        <div style={{ position: "absolute", left: 120, top: 112, display: "flex", alignItems: "center", gap: 16 }}>
          <Img src={staticFile("logo.png")} style={{ width: 52, height: 52, borderRadius: 14 }} />
          <span style={{ fontSize: 30, fontWeight: 800, letterSpacing: "-0.02em", color: C.ink }}>Side Pocket</span>
        </div>

        <div style={{ position: "absolute", left: 116, top: 460 - 2.08 * size, fontSize: size, fontWeight: 800, lineHeight: 1.04, letterSpacing: "-0.035em", color: C.ink }}>
          {l1}
          <br />
          <span style={{ color: C.violet }}>{l2}</span>
        </div>
        <div style={{ position: "absolute", left: 120, top: 498, width: 760, display: "flex", flexDirection: "column", gap: 40 }}>
          <div style={{ fontSize: 32, fontWeight: 600, lineHeight: 1.35, color: C.meta }}>{sub}</div>
          <div style={{ display: "flex", gap: 14 }}>
            {PLATFORMS.map((p) => (
              <div
                key={p}
                style={{
                  width: 72, height: 72, borderRadius: 20, background: C.white, display: "grid", placeItems: "center",
                  boxShadow: "0 1px 2px rgba(24,33,27,.06), 0 10px 24px rgba(60,40,140,.10)",
                }}
              >
                <Img src={staticFile(`platforms/${p}.svg`)} style={{ width: 36, height: 36 }} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: "absolute", left: 120, top: 884, display: "flex", gap: 44 }}>
          {META.map(([k, v]) => (
            <div key={k}>
              <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: C.meta }}>{k}</div>
              <div style={{ marginTop: 10, fontSize: 19, fontWeight: 600, color: C.ink }}>{v}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            position: "absolute", left: WIN.x, top: WIN.y, width: 1440 * SCALE, height: WIN.chrome + 900 * SCALE, borderRadius: 18,
            overflow: "hidden", background: C.white, boxShadow: "0 2px 4px rgba(24,33,27,.06), 0 40px 90px rgba(60,40,140,.20)",
          }}
        >
          <div style={{ height: WIN.chrome, display: "flex", alignItems: "center", gap: 8, padding: "0 16px", background: "#F1EFF8", borderBottom: `1px solid ${C.line}` }}>
            {["#FF6159", "#FFBD2E", "#28C941"].map((c) => (
              <span key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />
            ))}
            <span style={{ marginLeft: 18, padding: "4px 16px", borderRadius: 8, background: C.white, fontSize: 13, fontWeight: 600, color: C.meta }}>
              side-pocket-app.vercel.app
            </span>
          </div>
          <Img src={staticFile("cap/overview.png")} style={{ display: "block", width: 1440 * SCALE, height: 900 * SCALE }} />
        </div>

        <Payout p="bilibili" name="Bilibili" amt="+¥1,192.00" x={850} y={760} />
        <Payout p="contra" name="Contra" amt="+$940.86" x={1530} y={96} />
        <Img
          src={staticFile("mascot/piggy-bank.png")}
          style={{ position: "absolute", left: 1610, top: 790, height: 270, filter: "drop-shadow(0 18px 30px rgba(60,40,140,.22))" }}
        />
      </div>
    </AbsoluteFill>
  );
};
