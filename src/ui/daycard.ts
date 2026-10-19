import { inboxCounts } from "../sim/inbox";
import { dayReport, daySummary, shareText, snapshotDay, type DayReport, type DaySnap } from "../sim/summary";
import { game, onChange } from "../store";
import { apps } from "./apps";
import { esc, money } from "./dom";
import { notify } from "./uncanny";
import { close, dialog, openApp } from "./windows";
import "./daycard.css";

const CARD_ID = "daycard";
const ICON = "./art/icons/U-document.png";

// Two small desktop jobs that read the game state and change nothing in it:
// the day card after "Close the books", and the unread badge on the inbox icon.
export function startDayCard(desk: HTMLElement): void {
  let snap: DaySnap = snapshotDay(game());
  onChange(() => {
    const s = game();
    if (s.day > snap.day) show(desk, dayReport(snap, s));
    snap = s.day >= snap.day ? snapshotDay(s) : snap;
    badge(desk);
  }, ["all", "tick"]);
  setInterval(() => badge(desk), 1500); // reading a memo flags it without a save
  badge(desk);
}

// The inbox icon wears a count: unread memos, and in red how many want an answer.
function badge(desk: HTMLElement): void {
  const icon = desk.querySelector<HTMLElement>('[data-open="inbox"]');
  if (!icon) return;
  const { unread, decisions } = inboxCounts(game());
  let b = icon.querySelector<HTMLElement>(".badge");
  if (!unread && !decisions) return void b?.remove();
  if (!b) {
    b = document.createElement("i");
    b.className = "badge";
    icon.appendChild(b);
  }
  b.classList.toggle("ask", decisions > 0);
  b.textContent = decisions ? `${decisions}!` : String(unread);
  const label = `${unread} unread${decisions ? `, ${decisions} waiting for an answer` : ""}`;
  b.title = label;
  icon.setAttribute("aria-label", `Memo Inbox, ${label}`);
}

function show(desk: HTMLElement, r: DayReport): void {
  close(CARD_ID);
  const el = openApp({
    id: CARD_ID,
    title: `Day ${r.day} closed`,
    w: 400,
    h: 440,
    render: (body) => {
      body.classList.add("daycard");
      body.innerHTML = paint(r);
      body.addEventListener("click", (e) => {
        const t = e.target as HTMLElement;
        if (t.closest("[data-dc-inbox]")) {
          close(CARD_ID);
          openApp(apps(game()).find((a) => a.id === "inbox")!);
        } else if (t.closest("[data-dc-copy]")) void copy(desk, daySummary(game()), "Copied");
        else if (t.closest("[data-dc-share]")) void share(desk, shareText(r, game()));
        else if (t.closest("[data-dc-ok]")) close(CARD_ID);
      });
    },
  });
  el.querySelector<HTMLElement>("[data-dc-ok]")?.focus();
}

function paint(r: DayReport): string {
  const goal = r.goal
    ? r.goal.result === "met"
      ? `Met. Accounting released ${money(r.goal.pay)}.`
      : `Missed: ${esc(r.goal.text)} (${r.goal.have}/${r.goal.need})`
    : "None was set.";
  const t = r.tomorrow;
  return `
    <div class="dc-nums">
      <div class="inset"><span class="dim">Earned</span><b class="pos">+${money(r.earned)}</b></div>
      <div class="inset"><span class="dim">Spent</span><b class="neg">-${money(r.spent)}</b></div>
      <div class="inset"><span class="dim">In the bank</span><b>${money(r.cash)}</b></div>
    </div>
    <p><b>Lost:</b> ${r.lost.length ? esc(r.lost.join(", ")) : "nobody today."}</p>
    <p><b>Board goal:</b> ${goal}</p>
    ${r.best ? `<p><b>Best run:</b> ${esc(r.best.lead)}, ${r.best.finds} find${r.best.finds === 1 ? "" : "s"} worth ${money(r.best.value)}${r.topFind ? `. Top find: ${esc(r.topFind)}.` : "."}</p>` : ""}
    <h4>Tomorrow</h4>
    <ul>
      ${t.goal ? `<li><b>Goal:</b> ${esc(t.goal)}</li>` : ""}
      ${t.twist ? `<li><b>Twist:</b> ${esc(t.twist)}</li>` : ""}
      ${t.contracts.map((c) => `<li><b>Contract:</b> ${esc(c)}</li>`).join("")}
      <li><b>Inbox:</b> ${r.newMemos} new memo${r.newMemos === 1 ? "" : "s"}${r.decisions ? `, ${r.decisions} waiting for an answer` : ""}.</li>
    </ul>
    <div class="dc-btns">
      <button class="btn" data-dc-inbox>Open Memo Inbox</button>
      <button class="btn" data-dc-copy>Copy day summary</button>
      <button class="btn" data-dc-share>Share</button>
      <button class="btn" data-dc-ok>Start Day ${r.day + 1}</button>
    </div>`;
}

async function copy(desk: HTMLElement, text: string, title: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify(desk, ICON, title, text);
  } catch {
    void dialog("Day summary", text, ["OK"]); // no clipboard here: show it instead
  }
}

async function share(desk: HTMLElement, text: string): Promise<void> {
  try {
    if (navigator.share) return await navigator.share({ text });
  } catch (e) {
    if ((e as Error).name === "AbortError") return; // they changed their mind
  }
  await copy(desk, text, "Copied, ready to share");
}
