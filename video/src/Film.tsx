// The whole film: background, eleven scenes and the caption track (GPT-6.1 Sol's script).
import React from "react";
import { AbsoluteFill, Sequence, useCurrentFrame } from "remotion";
import { Caption, Line } from "./Caption";
import { C, prog, s } from "./theme";
import { Breakdown, Payouts, Reveal, Statements } from "./scenes/Opening";
import { Ask, Ledger, MyData, Overview, Progress, Tax } from "./scenes/Product";
import { End } from "./scenes/End";

const Background: React.FC = () => {
  const t = useCurrentFrame() / 30;
  return (
    <AbsoluteFill style={{ background: C.page, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: 1300, height: 1300, borderRadius: "50%", left: -420 + 70 * Math.sin(t / 7), top: -560 + 50 * Math.cos(t / 8), background: "radial-gradient(circle, rgba(107,91,194,0.17), rgba(107,91,194,0) 64%)" }} />
      <div style={{ position: "absolute", width: 1200, height: 1200, borderRadius: "50%", left: 1100 + 60 * Math.cos(t / 9), top: 300 + 50 * Math.sin(t / 6), background: "radial-gradient(circle, rgba(255,122,182,0.15), rgba(255,122,182,0) 64%)" }} />
    </AbsoluteFill>
  );
};

const Fade: React.FC<{ d: number; fade: number; children: React.ReactNode }> = ({ d, fade, children }) => {
  const f = useCurrentFrame();
  const o = Math.min(prog(f, 0, s(fade)), 1 - prog(f, d - s(fade), d));
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

/** A scene that fades in and out over its own span. */
const Scene: React.FC<{ from: number; to: number; fade?: number; children: React.ReactNode }> = ({ from, to, fade = 0.35, children }) => (
  <Sequence from={s(from)} durationInFrames={s(to - from)}>
    <Fade d={s(to - from)} fade={fade}>{children}</Fade>
  </Sequence>
);

const CAPTIONS: { lines: [string, number][]; end: number }[] = [
  { lines: [["Your side income is growing.", 0.25]], end: 2.5 },
  { lines: [["So is the work of keeping track.", 2.6]], end: 4.8 },
  { lines: [["Across platforms and currencies…", 4.9], ["what did you actually keep?", 5.9]], end: 7.5 },
  { lines: [["I designed Side Pocket to make that answer clear.", 7.6]], end: 11.5 },
  { lines: [["Import your statements.", 11.8], ["Side Pocket recognizes the platforms.", 14.8]], end: 18.5 },
  { lines: [["Different currencies. Visible fees.", 18.8], ["One clear ledger.", 22.0]], end: 25.5 },
  { lines: [["See where your money comes from,", 25.8], ["and what's left after expenses.", 28.8]], end: 32.5 },
  { lines: [["Choose your tax set-aside rate.", 32.8], ["See an estimate and the next payment date.", 35.8]], end: 39.5 },
  { lines: [["Ask a question.", 39.8], ["Trace the answer back to the math.", 42.8]], end: 46.5 },
  { lines: [["Less time untangling numbers.", 46.8], ["More room to see your progress.", 49.4]], end: 52.7 },
];

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.page }}>
    <Background />
    <Scene from={0} to={2.7} fade={0.25}><Payouts /></Scene>
    <Scene from={2.45} to={5.0} fade={0.25}><Statements /></Scene>
    <Scene from={4.75} to={7.7} fade={0.25}><Breakdown /></Scene>
    <Scene from={7.4} to={11.8}><Reveal /></Scene>
    <Scene from={11.4} to={18.8}><MyData /></Scene>
    <Scene from={18.4} to={25.8}><Ledger /></Scene>
    <Scene from={25.4} to={32.8}><Overview /></Scene>
    <Scene from={32.4} to={39.8}><Tax /></Scene>
    <Scene from={39.4} to={46.8}><Ask /></Scene>
    <Scene from={46.4} to={53.0}><Progress /></Scene>
    <Sequence from={s(52.6)} durationInFrames={s(6.8)}>
      <End dur={s(6.8)} />
    </Sequence>
    {CAPTIONS.map((c, i) => {
      const lines: Line[] = c.lines.map(([text, at], j) => ({ text, at: s(at), color: j ? C.violet : undefined }));
      return <Caption key={i} lines={lines} end={s(c.end)} />;
    })}
  </AbsoluteFill>
);
