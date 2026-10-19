import { MEMO_INTRUSIONS } from "../data/infection";
import { EVENTS } from "../data/events";
import { answerEvent, canChoose, choiceLabel } from "../sim/events";
import { infectionStage } from "../sim/infection";
import { makeRng } from "../sim/rng";
import { FILTERS, firstToOpen, inboxCounts, inboxList, isPending, isPinned, type InboxFilter } from "../sim/inbox";
import { fill, type GameState, type Memo } from "../sim/state";
import { game, update, watch } from "../store";
import { shownName } from "../privacy";
import { esc } from "./dom";
import "./inbox.css";

export function renderInbox(body: HTMLElement): void {
  body.classList.add("inbox");
  let openId: number | null = firstToOpen(game())?.id ?? null;
  let filter: InboxFilter = "all";
  const markRead = (id: number | null) => {
    const m = game().memos.find((x) => x.id === id);
    if (m && !m.read) m.read = true;
  };
  markRead(openId); // painted by the watch below, which saves nothing: it only flags
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const pick = t.closest<HTMLElement>("[data-choice]");
    if (pick) {
      const [id, c] = pick.dataset.choice!.split(":").map(Number);
      update((s) => void answerEvent(s, id, c));
      return;
    }
    const f = t.closest<HTMLElement>("[data-filter]");
    if (f) {
      filter = f.dataset.filter as InboxFilter;
      const first = inboxList(game(), filter).pinned.concat(inboxList(game(), filter).rest)[0];
      openId = first?.id ?? openId;
      update((s) => void (first && (s.memos.find((m) => m.id === first.id)!.read = true)));
      return;
    }
    if (t.closest("[data-readall]")) {
      update((s) => s.memos.forEach((m) => (m.read = true)));
      return;
    }
    const row = t.closest<HTMLElement>("[data-memo]");
    if (!row) return;
    openId = Number(row.dataset.memo);
    update((s) => {
      const m = s.memos.find((x) => x.id === openId);
      if (m) m.read = true;
    });
  });
  const row = (s: GameState, m: Memo, current: Memo | undefined, vars: Record<string, string>) => {
    const ask = isPending(m);
    const mark = ask ? `<b class="ask" title="Needs your answer"><img src="./art/icons/U-warning.png" alt="">Decide</b> ` : isPinned(s, m) ? `<b class="pin" title="Pinned: unread story">pinned</b> ` : "";
    return `<div class="msg ${m.read ? "" : "unread"} ${m === current ? "on" : ""} ${ask ? "decision" : ""}" data-memo="${m.id}">
      <span>${mark}${esc(fill(m.subject, vars))}</span><span class="dim">${esc(fill(m.from, vars))} · D${m.day}</span></div>`;
  };
  watch(body, () => {
    const s = game();
    const vars = { company: s.company, boss: shownName(s.bossName), phrase: s.catchphrase ?? "" };
    const current = s.memos.find((m) => m.id === openId) ?? firstToOpen(s);
    if (current && !openId) openId = current.id;
    const { pinned, rest } = inboxList(s, filter, current?.id);
    const counts = inboxCounts(s);
    body.innerHTML = `
      <div class="lcol">
        <div class="filters" role="toolbar" aria-label="Filter memos">${FILTERS.map(
          (f) => `<button class="tab ${f.id === filter ? "on" : ""}" data-filter="${f.id}" aria-pressed="${f.id === filter}">${f.label}${f.id === "unread" && counts.unread ? ` ${counts.unread}` : ""}${f.id === "decisions" && counts.decisions ? ` ${counts.decisions}` : ""}</button>`,
        ).join("")}<button class="tab" data-readall ${counts.unread ? "" : "disabled"}>Mark all read</button></div>
        <div class="list inset">${
          pinned.length + rest.length === 0
            ? `<p class="dim empty">Nothing here.</p>`
            : pinned.map((m) => row(s, m, current, vars)).join("") + (pinned.length && rest.length ? `<div class="sep dim">Earlier</div>` : "") + rest.map((m) => row(s, m, current, vars)).join("")
        }</div>
      </div>
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
