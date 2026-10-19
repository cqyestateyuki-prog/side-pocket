// On-screen captions: words rise in one after another; a second line can join the first.
import React from "react";
import { spring, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, clamp01, prog } from "./theme";

export type Line = { text: string; at: number; color?: string };

const Words: React.FC<{ line: Line; frame: number; fps: number }> = ({ line, frame, fps }) => (
  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", columnGap: "0.26em" }}>
    {line.text.split(" ").map((w, i) => {
      const p = spring({ frame: frame - line.at - i * 2, fps, config: { damping: 18, stiffness: 140, mass: 0.8 } });
      return (
        <span
          key={i}
          style={{
            display: "inline-block",
            opacity: clamp01(p * 1.3),
            transform: `translateY(${(1 - p) * 30}px)`,
            filter: `blur(${(1 - clamp01(p)) * 8}px)`,
          }}
        >
          {w}
        </span>
      );
    })}
  </div>
);

export const Caption: React.FC<{ lines: Line[]; end: number; color?: string; top?: number; size?: number; side?: number }> = ({
  lines,
  end,
  color = C.ink,
  top = 70,
  size = 58,
  side = 160,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  if (frame < lines[0].at - 2 || frame > end) return null;
  const out = prog(frame, end - 12, end);
  return (
    <div
      style={{
        position: "absolute",
        left: side,
        right: side,
        top,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.14,
        letterSpacing: "-0.022em",
        color,
        textAlign: "center",
        opacity: 1 - out,
        transform: `translateY(${-14 * out}px)`,
        zIndex: 50,
      }}
    >
      {lines.map((l, i) =>
        frame >= l.at - 2 ? (
          <div key={i} style={{ color: l.color ?? color }}>
            <Words line={l} frame={frame} fps={fps} />
          </div>
        ) : null,
      )}
    </div>
  );
};
