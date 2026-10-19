// A real Side Pocket screen (2x capture) in an app window, with a camera, a spotlight and
// pieces that fly in. All rects are page coordinates from the capture (src/rects/*.json).
import React from "react";
import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT, clamp01, lerp, prog, s } from "./theme";

export type R = [number, number, number, number];
/** A camera or spotlight state; each key eases from the previous one over [at, at + dur]. */
export type Key = { at: number; dur?: number; r: R; o?: number };
export type Area = { x: number; y: number; w: number; h: number };
export type Lift = { r: R; at: number; bg?: string; dx?: number; dy?: number; pop?: boolean; radius?: number };
export type Cover = { r: R; at: number; dur?: number; bg: string; wipe?: boolean };

export const AREA: Area = { x: 100, y: 262, w: 1720, h: 780 };
export const CHROME = 40;
export const pad = (r: R, p: number): R => [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p];

const lerpR = (a: R, b: R, t: number): R => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];

export function track(keys: Key[], frame: number) {
  let r = keys[0].r;
  let o = keys[0].o ?? 1;
  for (const k of keys.slice(1)) {
    const p = prog(frame, k.at, k.at + (k.dur ?? s(0.9)));
    if (p <= 0) break;
    r = lerpR(r, k.r, p);
    o = lerp(o, k.o ?? 1, p);
  }
  return { r, o };
}

/** Scale and offset that put rect r (page px) in the middle of the area. */
export function fit(r: R, area = AREA, maxS = 2) {
  const sc = Math.min(area.w / r[2], area.h / r[3], maxS);
  return { sc, tx: area.x + area.w / 2 - (r[0] + r[2] / 2) * sc, ty: area.y + area.h / 2 - (r[1] + r[3] / 2 + CHROME) * sc };
}

const Chrome: React.FC<{ w: number }> = ({ w }) => (
  <div style={{ position: "absolute", left: 0, top: 0, width: w, height: CHROME, background: C.white, borderBottom: `1px solid ${C.line}` }}>
    {[0, 1, 2].map((i) => (
      <div key={i} style={{ position: "absolute", left: 18 + i * 18, top: 15, width: 10, height: 10, borderRadius: 5, background: "#DCD8EA" }} />
    ))}
    <div
      style={{
        position: "absolute", left: w / 2 - 150, top: 8, width: 300, height: 24, borderRadius: 8, background: "#F3F1FA",
        fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.meta, textAlign: "center", lineHeight: "24px",
      }}
    >
      side-pocket-app.vercel.app
    </div>
  </div>
);

export const Screen: React.FC<{
  src: string;
  h: number;
  w?: number;
  cam: Key[];
  spot?: Key[];
  lifts?: Lift[];
  covers?: Cover[];
  maxS?: number;
  opacity?: number;
  /** Extra layers in page coordinates; `top` draws them above the spotlight. */
  under?: React.ReactNode;
  top?: React.ReactNode;
}> = ({ src, h, w = 1440, cam, spot, lifts = [], covers = [], maxS = 2, opacity = 1, under, top }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { r } = track(cam, frame);
  const { sc, tx, ty } = fit(r, AREA, maxS);
  const img = staticFile(src);
  const sp = spot ? track(spot, frame) : null;
  return (
    <AbsoluteFill
      style={{
        opacity,
        WebkitMaskImage: "linear-gradient(to bottom, transparent 214px, black 268px)",
        maskImage: "linear-gradient(to bottom, transparent 214px, black 268px)",
      }}
    >
      <div
        style={{
          position: "absolute", left: 0, top: 0, width: w, height: h + CHROME, transformOrigin: "0 0",
          transform: `translate(${tx}px, ${ty}px) scale(${sc})`, borderRadius: 16, overflow: "hidden", background: C.page,
          boxShadow: "0 2px 6px rgba(25,26,43,.06), 0 40px 90px rgba(70,50,150,.20)",
        }}
      >
        <Chrome w={w} />
        <div style={{ position: "absolute", left: 0, top: CHROME, width: w, height: h }}>
          <Img src={img} style={{ width: w, height: h, display: "block" }} />
          {covers.map((c, i) => {
            const p = prog(frame, c.at, c.at + (c.dur ?? s(0.8)));
            const [x, y, cw, ch] = c.r;
            return c.wipe ? (
              <div key={i} style={{ position: "absolute", left: x + cw * p, top: y, width: cw * (1 - p), height: ch, background: c.bg }} />
            ) : (
              <div key={i} style={{ position: "absolute", left: x, top: y, width: cw, height: ch, background: c.bg, opacity: 1 - p }} />
            );
          })}
          {lifts.map((l, i) => {
            const p = spring({ frame: frame - l.at, fps, config: { damping: 17, stiffness: 150, mass: 0.8 } });
            const [x, y, lw, lh] = l.r;
            return (
              <React.Fragment key={i}>
                <div style={{ position: "absolute", left: x, top: y, width: lw, height: lh, background: l.bg ?? C.page }} />
                <div
                  style={{
                    position: "absolute", left: x, top: y, width: lw, height: lh, overflow: "hidden", borderRadius: l.radius ?? 0,
                    opacity: clamp01(p * 1.6),
                    transform: `translate(${(1 - p) * (l.dx ?? 0)}px, ${(1 - p) * (l.dy ?? 26)}px) scale(${l.pop ? 0.9 + 0.1 * p : 1})`,
                  }}
                >
                  <Img src={img} style={{ position: "absolute", left: -x, top: -y, width: w, height: h, maxWidth: "none" }} />
                </div>
              </React.Fragment>
            );
          })}
          {under}
          {sp && sp.o > 0.005 ? (
            <div
              style={{
                position: "absolute", left: sp.r[0] - 8, top: sp.r[1] - 8, width: sp.r[2] + 16, height: sp.r[3] + 16, borderRadius: 14,
                boxShadow: `0 0 0 ${3 / sc}px rgba(107,91,194,${sp.o}), 0 0 ${26 / sc}px ${4 / sc}px rgba(107,91,194,${0.4 * sp.o}), 0 0 0 4000px rgba(25,26,43,${0.36 * sp.o})`,
              }}
            />
          ) : null}
          {top}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/** Where a page point lands on the frame for a given camera rect (for overlays outside the window). */
export function toFrame(r: R, px: number, py: number, maxS = 2) {
  const { sc, tx, ty } = fit(r, AREA, maxS);
  return { x: tx + px * sc, y: ty + (py + CHROME) * sc, sc };
}
