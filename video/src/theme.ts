// Product tokens (web/styles/tokens.css) and timing helpers shared by every scene.
import { Easing } from "remotion";

export const C = {
  page: "#F8F7FC",
  ink: "#191A2B",
  meta: "#696B83",
  line: "#E4E1F0",
  lineStrong: "#CDC8E2",
  violet: "#6B5BC2",
  violet700: "#5446A1",
  violet100: "#ECE9F8",
  onViolet: "#F1EEFC",
  pink: "#FF7AB6",
  pink100: "#FFE3F0",
  pinkText: "#C42F78",
  fee: "#B65A34",
  payout: "#9A8E78",
  white: "#FFFFFF",
};

export const FONT = '"Plus Jakarta Sans", ui-sans-serif, system-ui, sans-serif';
export const MONO = '"SF Mono", ui-monospace, Menlo, "PingFang SC", monospace';

export const FPS = 30;
export const W = 1920;
export const H = 1080;
export const DURATION = 1782; // 59.4 s

/** Seconds to frames. */
export const s = (sec: number) => Math.round(sec * FPS);

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

/** Eased 0..1 progress of `frame` between frames a and b. */
export const prog = (frame: number, a: number, b: number, ease = easeInOut) =>
  ease(clamp01((frame - a) / Math.max(1, b - a)));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
