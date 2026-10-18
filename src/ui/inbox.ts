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
    const current = s.memos.find((m) => m.id === openId) ?? s.memos[0];
    if (current && openId === null) current.read = true;
    body.innerHTML = `
      <div class="list inset">${s.memos
        .map(
          (m) => `<div class="msg ${m.read ? "" : "unread"} ${m === current ? "on" : ""}" data-memo="${m.id}">
            <span>${esc(m.subject)}</span><span class="dim">${esc(m.from)} · D${m.day}</span></div>`,
        )
        .join("")}</div>
      <div class="memo inset">${
        current ? `<b>FROM:</b> ${esc(current.from)}\n<b>TO:</b> ${esc(s.bossName)}\n<b>RE:</b> ${esc(current.subject)}\n\n${esc(current.body)}` : "No memos."
      }</div>`;
  });
}
