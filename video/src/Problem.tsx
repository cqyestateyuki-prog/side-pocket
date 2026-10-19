// Portfolio still for The Problem: one month of side income, seven statements that each write it differently.
// Dates, fee columns and amounts come from Moon Spirit's sample statements (web/demo/samples).
import React from "react";
import { AbsoluteFill, Img, staticFile } from "remotion";
import { C, FONT, MONO } from "./theme";

const CARDS = [
  { p: "fiverr", name: "Fiverr", paid: "Sep 1", amt: "+$209.80", date: "2026-09-01T09:32:00Z", fee: null },
  { p: "patreon", name: "Patreon", paid: "Sep 1", amt: "+$647.43", date: "Sep 2026", fee: "Patreon Fee (USD)" },
  { p: "bilibili", name: "Bilibili", paid: "Sep 3", amt: "+¥1,192.00", date: "2026/09/03", fee: "平台分成(元)" },
  { p: "twitch", name: "Twitch", paid: "Sep 5", amt: "+$56.65", date: "09/05/2026", fee: "Twitch Share (USD)" },
  { p: "upwork", name: "Upwork", paid: "Sep 8", amt: "+$398.90", date: "\"Sep 8, 2026\"", fee: "Service Fee Rate" },
  { p: "youtube", name: "YouTube", paid: "Sep 28", amt: "+$522.47", date: "2026-09-28", fee: "YouTube Share (USD)" },
  { p: "contra", name: "Contra", paid: "Sep 28", amt: "+$940.86", date: "\"September 28, 2026\"", fee: null },
];

const Label: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.meta, marginBottom: 8 }}>{children}</div>
);

export const Problem: React.FC = () => (
  <AbsoluteFill style={{ background: C.page, fontFamily: FONT, overflow: "hidden" }}>
    <div style={{ position: "absolute", width: 1300, height: 1300, borderRadius: "50%", left: -500, top: -620, background: "radial-gradient(circle, rgba(107,91,194,0.16), rgba(107,91,194,0) 64%)" }} />
    <div style={{ position: "absolute", width: 1200, height: 1200, borderRadius: "50%", left: 1200, top: 500, background: "radial-gradient(circle, rgba(255,122,182,0.16), rgba(255,122,182,0) 64%)" }} />
    <div style={{ position: "absolute", left: 110, top: 86, fontSize: 22, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: C.meta }}>
      Moon Spirit · September 2026
    </div>
    <div style={{ position: "absolute", left: 110, right: 110, top: 150, bottom: 100, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gridTemplateRows: "repeat(2, 1fr)", gap: 30 }}>
      {CARDS.map((c) => (
        <div
          key={c.p}
          style={{
            background: C.white, borderRadius: 26, padding: "30px 30px 26px", display: "flex", flexDirection: "column",
            boxShadow: "0 1px 2px rgba(24,33,27,.06), 0 16px 40px rgba(60,40,140,.10)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 54, height: 54, borderRadius: 16, background: C.violet100, display: "grid", placeItems: "center" }}>
              <Img src={staticFile(`platforms/${c.p}.svg`)} style={{ width: 30, height: 30 }} />
            </div>
            <span style={{ fontSize: 28, fontWeight: 700, color: C.ink }}>{c.name}</span>
          </div>
          <div style={{ marginTop: 22, fontSize: 46, fontWeight: 800, letterSpacing: "-0.02em", color: C.violet, fontVariantNumeric: "tabular-nums" }}>{c.amt}</div>
          <div style={{ marginTop: 6, fontSize: 21, fontWeight: 600, color: C.meta }}>Paid {c.paid}</div>
          <div style={{ marginTop: "auto" }}>
            <Label>Date in file</Label>
            <span style={{ fontFamily: MONO, fontSize: 20, background: C.pink100, color: C.pinkText, borderRadius: 8, padding: "4px 10px" }}>{c.date}</span>
            <div style={{ height: 22 }} />
            <Label>Fee column</Label>
            {c.fee ? (
              <span style={{ fontFamily: MONO, fontSize: 20, background: C.violet100, color: C.violet700, borderRadius: 8, padding: "4px 10px" }}>{c.fee}</span>
            ) : (
              <span style={{ fontSize: 20, fontWeight: 600, color: C.meta }}>None in the file</span>
            )}
          </div>
        </div>
      ))}
      <div
        style={{
          borderRadius: 26, padding: "34px 34px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 18,
          background: `linear-gradient(160deg, ${C.violet} 0%, ${C.violet700} 100%)`, color: C.white,
        }}
      >
        {[["7", "statements"], ["7", "date formats"], ["2", "currencies"]].map(([n, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
            <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1 }}>{n}</span>
            <span style={{ fontSize: 28, fontWeight: 600, color: C.onViolet }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  </AbsoluteFill>
);
