import { ITEMS } from "../data/items";
import { canEndDay, endDay, sell, sellPrice, wage } from "../sim/economy";
import { bribe, bribeCost, canBribe } from "../sim/office";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

export function renderLedger(body: HTMLElement): void {
  body.classList.add("ledger");
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const sellBtn = t.closest<HTMLButtonElement>("[data-sell]");
    if (sellBtn) update((s) => void sell(s, Number(sellBtn.dataset.sell)));
    if (t.closest("[data-endday]")) update((s) => void endDay(s));
    if (t.closest("[data-bribe]")) update((s) => void bribe(s));
  });
  watch(body, () => {
    const s = game();
    body.innerHTML = `
      <div class="cash inset"><span class="dim">Balance</span><b>${money(s.cash)}</b></div>
      ${target(s)}
      ${heat(s)}
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
      <p class="dim">Tonight's payroll: ${money(s.crew.filter((w) => w.status !== "dead").reduce((a, w) => a + wage(w), 0))}${s.research ? ". The lab reports tonight." : ""}</p>
      <button class="btn" data-endday ${canEndDay(s) ? "" : "disabled"}>Close the books (end Day ${s.day})</button>
      ${canEndDay(s) ? "" : `<p class="dim">A crew is still out. You can't go home yet.</p>`}`;
  });
}

// The Board's target for this fiscal year, as a progress bar.
function target(s: ReturnType<typeof game>): string {
  const t = s.target;
  const pct = Math.max(0, Math.min(100, Math.round((100 * s.cash) / t.amount)));
  const days = t.deadline - s.day;
  const when = days <= 0 ? "due tonight" : days === 1 ? "due tomorrow" : `${days} days left`;
  return `<div class="target inset"><div class="dim">Fiscal year ${t.year} target: <b>${money(t.amount)}</b> by Day ${t.deadline} (${when})</div>
    <div class="bar"><i style="width:${pct}%" class="${pct >= 100 ? "met" : ""}"></i></div></div>`;
}

// Heat, and the discreet way to lower it.
function heat(s: ReturnType<typeof game>): string {
  const mood = s.heat >= 80 ? "An inspection is coming." : s.heat >= 60 ? "People are asking questions." : s.heat >= 30 ? "Some talk in town." : "Nobody is looking.";
  return `<div class="heat inset"><div class="dim">Heat: <b>${s.heat}%</b>. ${mood}</div>
    <div class="bar"><i style="width:${s.heat}%"></i></div>
    ${s.heat >= 10 ? `<button class="btn" data-bribe ${canBribe(s) ? "" : "disabled"}>Donate to the inspector's retirement fund (${money(bribeCost(s))})</button>` : ""}</div>`;
}
