import { infectionStage } from "../sim/infection";
import { makeRng } from "../sim/rng";
import { fill, type GameState } from "../sim/state";
import { game, update, watch } from "../store";
import { esc } from "./dom";

export function renderInbox(body: HTMLElement): void {
  body.classList.add("inbox");
  let openId: number | null = null;
  body.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-memo]");
    if (!row) return;
    openId = Number(row.dataset.memo);
    update((s) => {
      const m = s.memos.find((x) => x.id === openId);
      if (m) m.read = true;
    });
  });
  watch(body, () => {
    const s = game();
    const vars = { company: s.company, boss: s.bossName, phrase: s.catchphrase ?? "" };
    const current = s.memos.find((m) => m.id === openId) ?? s.memos[0];
    if (current && openId === null) current.read = true;
    body.innerHTML = `
      <div class="list inset">${s.memos
        .map(
          (m) => `<div class="msg ${m.read ? "" : "unread"} ${m === current ? "on" : ""}" data-memo="${m.id}">
            <span>${esc(fill(m.subject, vars))}</span><span class="dim">${esc(fill(m.from, vars))} · D${m.day}</span></div>`,
        )
        .join("")}</div>
      <div class="memo inset">${
        current ? `<b>FROM:</b> ${esc(fill(current.from, vars))}\n<b>TO:</b> ${esc(s.bossName)}\n<b>RE:</b> ${esc(fill(current.subject, vars))}\n\n${warp(s, current.id, esc(fill(current.body, vars)))}` : "No memos."
      }</div>`;
  });
}

// Once the office is infected, old memos start saying your name in places
// they didn't before. The same memo always warps the same way.
function warp(s: GameState, id: number, html: string): string {
  const stage = infectionStage(s);
  if (stage < 2) return html;
  const rng = makeRng(id * 7919 + stage);
  const rate = [0, 0, 0.03, 0.07, 0.14][stage];
  return html.replace(/\b[a-z]{5,}\b/g, (word) => (rng() < rate ? `<span class="warp">${esc(s.bossName)}</span>` : word));
}
