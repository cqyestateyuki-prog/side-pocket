// Scene 11: the closing line on the product's violet, with Tilly and the link.
import React from "react";
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { Caption } from "../Caption";
import { C, FONT, clamp01, easeInOut, prog, s } from "../theme";

export const End: React.FC<{ dur: number }> = ({ dur }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const open = prog(f, 0, s(0.8), easeInOut);
  const tilly = spring({ frame: f - s(0.7), fps, config: { damping: 12, stiffness: 120 } });
  const brand = spring({ frame: f - s(2.69), fps, config: { damping: 18, stiffness: 120 } });
  return (
    <AbsoluteFill style={{ clipPath: `circle(${open * 1250}px at 50% 58%)` }}>
      <AbsoluteFill style={{ background: `linear-gradient(160deg, ${C.violet} 0%, ${C.violet700} 100%)` }} />
      <div style={{ position: "absolute", left: 1330, top: 640, width: 900, height: 900, borderRadius: "50%", background: C.pink, transform: `scale(${0.85 + 0.15 * open})` }} />
      <div style={{ position: "absolute", left: 1270, top: 580, width: 1020, height: 1020, borderRadius: "50%", border: `46px solid ${C.violet700}`, opacity: 0.55 }} />
      <Img
        src={staticFile("mascot/wave.png")}
        style={{
          position: "absolute", left: 1450, top: 640, height: 330, opacity: clamp01(tilly * 2),
          transform: `translateY(${(1 - tilly) * 120}px) rotate(${Math.sin(f / 9) * 2}deg)`, transformOrigin: "50% 100%",
          filter: "drop-shadow(0 18px 30px rgba(25,26,43,.25))",
        }}
      />
      <Caption lines={[{ text: "Tracking your side income shouldn't be a second job.", at: s(0.9) }]} end={dur + 30} color={C.white} top={330} size={80} side={360} />
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 690, display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          opacity: clamp01(brand * 1.4), transform: `translateY(${(1 - brand) * 24}px)`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <Img src={staticFile("logo.png")} style={{ width: 64, height: 64, borderRadius: 16 }} />
          <span style={{ fontFamily: FONT, fontSize: 46, fontWeight: 800, letterSpacing: "-0.02em", color: C.white }}>Side Pocket</span>
        </div>
        <span style={{ fontFamily: FONT, fontSize: 24, fontWeight: 600, color: C.onViolet, opacity: 0.85 }}>side-pocket-app.vercel.app</span>
      </div>
    </AbsoluteFill>
  );
};
