import { ITEMS } from "../data/items";
import { canEndDay, endDay, sell, sellPrice } from "../sim/economy";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

export function renderLedger(body: HTMLElement): void {
  body.classList.add("ledger");
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const sellBtn = t.closest<HTMLButtonElement>("[data-sell]");
    if (sellBtn) update((s) => void sell(s, Number(sellBtn.dataset.sell)));
    if (t.closest("[data-endday]")) update((s) => void endDay(s));
  });
  watch(body, () => {
    const s = game();
    body.innerHTML = `
      <div class="cash inset"><span class="dim">Balance</span><b>${money(s.cash)}</b></div>
      <h3>Loot on hand</h3>
      ${
        s.loot.length
          ? `<div class="loot">${s.loot
              .map(
                (l) => `<div class="row"><img src="${art.item(ITEMS[l.itemId].art)}" alt="">
                <span class="nm">${esc(ITEMS[l.itemId].name)}<br><span class="dim">found by ${esc(l.foundBy)}</span></span>
                <button class="btn" data-sell="${l.id}">Sell ${money(sellPrice(l.itemId))}</button></div>`,
              )
              .join("")}</div>`
          : `<p class="dim">Nothing to sell. Send a crew in.</p>`
      }
      <h3>Transactions</h3>
      <table class="tx inset">${s.ledger
        .slice(0, 40)
        .map((e) => `<tr><td class="dim">D${e.day}</td><td>${esc(e.text)}</td><td class="${e.amount < 0 ? "neg" : "pos"}">${money(e.amount)}</td></tr>`)
        .join("")}</table>
      <button class="btn" data-endday ${canEndDay(s) ? "" : "disabled"}>Close the books (end Day ${s.day})</button>
      ${canEndDay(s) ? "" : `<p class="dim">A crew is still out. You can't go home yet.</p>`}`;
  });
}
