import { tier } from "./facilities";
import { has } from "./projects";
import type { GameState } from "./state";

// Which render layers of the office view (src/ui/office3d.ts) a save shows:
// every bought tier of each upgrade adds its props, the radio antenna is
// replaced rather than stacked, and Floor 2 opens the hallway door.
export function officeLayers(state: GameState, opts: { figure?: boolean } = {}): string[] {
  const out = [has(state, "floor2") ? "fx_door_open" : "fx_door_closed"];
  for (const id of ["breakroom", "dispatch", "lab", "security"])
    for (let t = 1; t <= Math.min(4, tier(state, id)); t++) out.push(`up_${id}_${t}`);
  const mast = Math.min(4, tier(state, "mast"));
  if (mast) out.push(`up_mast_${mast}`);
  if (opts.figure) out.push("fx_figure");
  return out;
}
