// Page rects recorded at capture time (scratchpad cap2x.mjs): look one up by selector and index or text.
import type { R } from "./Screen";
import ask0 from "./rects/ask0.json";
import ask1 from "./rects/ask1.json";
import ledger from "./rects/ledger.json";
import milestones from "./rects/milestones.json";
import mydata from "./rects/mydata.json";
import mydata0 from "./rects/mydata0.json";
import overview from "./rects/overview.json";
import settings from "./rects/settings.json";
import tax from "./rects/tax.json";

type Rec = { s: string; i: number; t: string; x: number; y: number; w: number; h: number };
const SCREENS: Record<string, { rects: Rec[] }> = { ask0, ask1, ledger, milestones, mydata, mydata0, overview, settings, tax };

export function rect(screen: string, sel: string, which: number | string = 0): R {
  const list = SCREENS[screen].rects.filter((r) => r.s === sel);
  const hit = typeof which === "number" ? list.find((r) => r.i === which) : list.find((r) => r.t.includes(which));
  if (!hit) throw new Error(`no rect: ${screen} ${sel} ${which}`);
  return [hit.x, hit.y, hit.w, hit.h];
}
