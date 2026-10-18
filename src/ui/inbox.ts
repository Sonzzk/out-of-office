import { MEMO_INTRUSIONS } from "../data/infection";
import { EVENTS } from "../data/events";
import { answerEvent, canChoose, choiceLabel } from "../sim/events";
import { infectionStage } from "../sim/infection";
import { makeRng } from "../sim/rng";
import { fill, type GameState, type Memo } from "../sim/state";
import { game, update, watch } from "../store";
import { shownName } from "../privacy";
import { esc } from "./dom";

export function renderInbox(body: HTMLElement): void {
  body.classList.add("inbox");
  let openId: number | null = null;
  body.addEventListener("click", (e) => {
    const pick = (e.target as HTMLElement).closest<HTMLElement>("[data-choice]");
    if (pick) {
      const [id, c] = pick.dataset.choice!.split(":").map(Number);
      update((s) => void answerEvent(s, id, c));
      return;
    }
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
    const vars = { company: s.company, boss: shownName(s.bossName), phrase: s.catchphrase ?? "" };
    const current = s.memos.find((m) => m.id === openId) ?? s.memos[0];
    if (current && openId === null) current.read = true;
    body.innerHTML = `
      <div class="list inset">${s.memos
        .map(
          (m) => `<div class="msg ${m.read ? "" : "unread"} ${m === current ? "on" : ""}" data-memo="${m.id}">
            <span>${m.event && m.event.choice === undefined ? `<b class="ask">!</b> ` : ""}${esc(fill(m.subject, vars))}</span><span class="dim">${esc(fill(m.from, vars))} · D${m.day}</span></div>`,
        )
        .join("")}</div>
      <div class="memo inset">${
        current ? `<b>FROM:</b> ${esc(fill(current.from, vars))}\n<b>TO:</b> ${esc(shownName(s.bossName))}\n<b>RE:</b> ${esc(fill(current.subject, vars))}\n\n${warp(s, current.id, esc(fill(current.body, vars)))}${current.event ? decision(s, current) : ""}` : "No memos."
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
  const out = html.replace(/\b[a-z]{5,}\b/g, (word) => (rng() < rate ? `<span class="warp">${esc(shownName(s.bossName))}</span>` : word));
  // From stage 3 some memos grow an extra line that nobody typed.
  if (stage >= 3 && rng() < 0.35 * (stage - 2)) {
    const line = MEMO_INTRUSIONS[Math.floor(rng() * MEMO_INTRUSIONS.length)].replace("{boss}", esc(shownName(s.bossName)));
    return `${out}\n\n<span class="warp">${line}</span>`;
  }
  return out;
}

// Event memos end with their choices, or with what happened once answered.
function decision(s: GameState, m: Memo): string {
  const e = m.event!;
  if (e.choice !== undefined) return `<div class="decided">${esc(e.result ?? "")}</div>`;
  return `<div class="choices">${EVENTS[e.id].choices
    .map((_, i) => `<button class="btn" data-choice="${m.id}:${i}" ${canChoose(s, m, i) ? "" : "disabled"}>${esc(choiceLabel(m, i))}</button>`)
    .join("")}</div><div class="dim">If you don't answer by the end of the day: ${esc(choiceLabel(m, EVENTS[e.id].fallback))}.</div>`;
}
