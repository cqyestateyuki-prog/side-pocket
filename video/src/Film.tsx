// The whole film: background, music, eleven scenes and the caption track (GPT-6.1 Sol's script).
import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from "remotion";
import { Caption, Line } from "./Caption";
import { C, DURATION, prog, s } from "./theme";
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

// "Startup" by Ivan_Luzan (Pixabay): 134 BPM, the drum loop enters 1.776 s into the track.
// Not in the repo (Pixabay licence): save https://pixabay.com/music/corporate-startup-584790/ as public/music/startup.mp3.
// The track starts 46 frames in, so beat 0 lands at 0.243 s; every cue below is a beat number.
const TRIM = 46;
const BEAT = 60 / 134;
const beat = (n: number) => 1.776 - TRIM / 30 + n * BEAT;

const CAPTIONS: { lines: [string, number][]; end: number }[] = [
  { lines: [["Your side income is growing.", beat(0)]], end: beat(5) - 0.08 },
  { lines: [["So is the work of keeping track.", beat(5)]], end: beat(10) - 0.08 },
  { lines: [["Across platforms and currencies…", beat(10)], ["what did you actually keep?", beat(13)]], end: beat(16) + 0.2 },
  { lines: [["I designed Side Pocket to make that answer clear.", beat(17)]], end: beat(26) - 0.3 },
  ...[
    ["Import your statements.", "Side Pocket recognizes the platforms."],
    ["Different currencies. Visible fees.", "One clear ledger."],
    ["See where your money comes from,", "and what's left after expenses."],
    ["Choose your tax set-aside rate.", "See an estimate and the next payment date."],
    ["Ask a question.", "Trace the answer back to the math."],
    ["Less time untangling numbers.", "More room to see your progress."],
  ].map(([a, b], i) => {
    const at = 26 + 16 * i;
    return { lines: [[a, beat(at)], [b, beat(at + (i === 5 ? 6 : 7))]] as [string, number][], end: i === 5 ? beat(120) + 0.1 : beat(at + 16) - 0.3 };
  }),
];

/** Product scene i starts just before its caption's beat and runs four bars. */
const prod = (i: number) => ({ from: beat(26 + 16 * i) - 0.4, to: beat(42 + 16 * i) });

export const Film: React.FC = () => (
  <AbsoluteFill style={{ background: C.page }}>
    <Background />
    <Audio
      src={staticFile("music/startup.mp3")}
      trimBefore={TRIM}
      volume={(f) => 0.5 * Math.min(prog(f, 0, 4), 1 - prog(f, s(beat(128)), DURATION))}
    />
    <Scene from={0} to={beat(5) + 0.1} fade={0.25}><Payouts /></Scene>
    <Scene from={beat(5) - 0.15} to={beat(10) + 0.1} fade={0.25}><Statements /></Scene>
    <Scene from={beat(10) - 0.15} to={beat(16) + 0.05} fade={0.25}><Breakdown /></Scene>
    <Scene from={beat(16) - 0.1} to={beat(26)}><Reveal /></Scene>
    <Scene {...prod(0)}><MyData /></Scene>
    <Scene {...prod(1)}><Ledger /></Scene>
    <Scene {...prod(2)}><Overview /></Scene>
    <Scene {...prod(3)}><Tax /></Scene>
    <Scene {...prod(4)}><Ask /></Scene>
    <Scene from={prod(5).from} to={beat(120) + 0.4}><Progress /></Scene>
    <Sequence from={s(beat(120))}>
      <End dur={DURATION - s(beat(120))} />
    </Sequence>
    {CAPTIONS.map((c, i) => {
      const lines: Line[] = c.lines.map(([text, at], j) => ({ text, at: s(at), color: j ? C.violet : undefined }));
      return <Caption key={i} lines={lines} end={s(c.end)} />;
    })}
  </AbsoluteFill>
);
