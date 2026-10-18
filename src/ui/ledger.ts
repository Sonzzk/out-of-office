import { goalPay, goalText } from "../sim/goals";
import { canDeliver, contractHave, contractText, deliver } from "../sim/contracts";
import { twistToday } from "../sim/twists";
import { sfx } from "./audio";
import { ITEMS } from "../data/items";
import { canEndDay, endDay, sell, sellAll, sellPrice, wage } from "../sim/economy";
import { upkeep } from "../sim/facilities";
import { DEEP_CLEAN_AMOUNT, DEEP_CLEAN_COST } from "../data/infection";
import { canDeepClean, deepClean } from "../sim/infection";
import { bribe, bribeCost, canBribe } from "../sim/office";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

// The buyer on the phone after a Sell all. It sits in the Ledger for a few seconds.
const BUYER_LINES = ["Hm. Hm. Fine.", "Put it on the pile. No, the other pile.", "I did not hear that. I will take it.", "Cash. Do not count it in front of me."];
const KEEN_LINES = ["Hm. Hm. Better than fine.", "You caught me on a good day. Do not make it a habit."];
const CHATTER_MS = 4500;
let chatter: { text: string; at: number } | undefined;

function buyerCall(total: number, keen: boolean): void {
  const list = keen ? KEEN_LINES : BUYER_LINES;
  chatter = { text: list[total % list.length], at: Date.now() };
  sfx("ding");
  setTimeout(() => update(() => {}), CHATTER_MS + 50);
}

export function renderLedger(body: HTMLElement): void {
  body.classList.add("ledger");
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const sellBtn = t.closest<HTMLButtonElement>("[data-sell]");
    if (sellBtn) update((s) => void sell(s, Number(sellBtn.dataset.sell)));
    if (t.closest("[data-sellall]")) update((s) => buyerCall(sellAll(s), !!twistToday(s) && twistToday(s)!.id === "buyer"));
    const del = t.closest<HTMLButtonElement>("[data-deliver]");
    if (del) update((s) => void deliver(s, Number(del.dataset.deliver)));
    if (t.closest("[data-endday]")) update((s) => void endDay(s));
    if (t.closest("[data-bribe]")) update((s) => void bribe(s));
    if (t.closest("[data-clean]")) update((s) => void deepClean(s));
  });
  watch(body, () => {
    const s = game();
    body.innerHTML = `
      ${twistLine(s)}
      <div class="cash inset"><span class="dim">Balance</span><b>${money(s.cash)}</b></div>
      ${buyer()}
      ${goals(s)}
      ${target(s)}
      ${heat(s)}
      ${s.infection >= 10 ? `<div class="heat inset"><div class="dim">Facilities reports the air is <b>${s.infection >= 60 ? "bad" : s.infection >= 30 ? "damp" : "a bit off"}</b>.</div>
        <button class="btn" data-clean ${canDeepClean(s) ? "" : "disabled"}>Book a deep clean (${money(DEEP_CLEAN_COST)}, clears ${DEEP_CLEAN_AMOUNT}%)</button></div>` : ""}
      <h3>Loot on hand${s.loot.length > 1 ? ` <button class="btn" data-sellall>Sell all ${money(s.loot.reduce((a, l) => a + sellPrice(l.itemId, s), 0))}</button>` : ""}</h3>
      ${
        s.loot.length
          ? `<div class="loot">${s.loot
              .map(
                (l) => `<div class="row"><img src="${art.item(ITEMS[l.itemId].art)}" alt="">
                <span class="nm">${esc(ITEMS[l.itemId].name)}<br><span class="dim">found by ${esc(l.foundBy)}</span></span>
                <button class="btn" data-sell="${l.id}">Sell ${money(sellPrice(l.itemId, s))}</button></div>`,
              )
              .join("")}</div>`
          : `<p class="dim">Nothing to sell. Send a crew in.</p>`
      }
      <h3>Transactions</h3>
      <table class="tx inset">${s.ledger
        .slice(0, 40)
        .map((e) => `<tr><td class="dim">D${e.day}</td><td>${esc(e.text)}</td><td class="${e.amount < 0 ? "neg" : "pos"}">${money(e.amount)}</td></tr>`)
        .join("")}</table>
      <p class="dim">Tonight's payroll: ${money(s.crew.filter((w) => w.status !== "dead").reduce((a, w) => a + wage(w), 0))}${upkeep(s) ? `, plus ${money(upkeep(s))} upkeep` : ""}${s.research.length ? ". The lab reports tonight." : ""}</p>
      <button class="btn" data-endday ${canEndDay(s) ? "" : "disabled"}>Close the books (end Day ${s.day})</button>
      ${canEndDay(s) ? "" : `<p class="dim">A crew is still out. You can't go home yet.</p>`}`;
  });
}

// Today's twist, if the morning brought one.
function twistLine(s: ReturnType<typeof game>): string {
  const t = twistToday(s);
  return t ? `<div class="twist inset"><b>${esc(t.name)}.</b> ${esc(t.text)}</div>` : "";
}

// Phone chatter from the buyer, with a stamp.
function buyer(): string {
  if (!chatter || Date.now() - chatter.at > CHATTER_MS) return "";
  const fresh = Date.now() - chatter.at < 700;
  return `<div class="buyer inset"><span class="dim">Buyer:</span> ${esc(chatter.text)}<span class="stamp ${fresh ? "fresh" : ""}">PAID</span></div>`;
}

// The daily goal and any open contracts, in one place.
function goals(s: ReturnType<typeof game>): string {
  const g = s.goal;
  const rows: string[] = [];
  if (g && g.day === s.day) {
    const pct = Math.min(100, Math.round((100 * g.have) / g.need));
    rows.push(`<div class="dim">Today's goal: <b>${goalText(g)}</b> ${g.done ? "Done, bonus paid." : `Pays ${money(goalPay(s, g))}${goalPay(s, g) > g.reward ? " (double)" : ""}. (${g.have}/${g.need})`}</div>
      <div class="bar"><i style="width:${pct}%" class="${g.done ? "met" : ""}"></i></div>`);
  }
  for (const c of s.contracts ?? []) {
    const have = Math.min(c.need, contractHave(s, c));
    const left = c.deadline - s.day;
    rows.push(`<div class="dim">Contract: <b>${esc(contractText(c))}</b> for ${money(c.reward)}, by Day ${c.deadline} (${left <= 0 ? "last day" : left === 1 ? "1 day left" : `${left} days left`}). (${have}/${c.need})</div>
      <div class="bar"><i style="width:${Math.round((100 * have) / c.need)}%" class="${canDeliver(s, c) ? "met" : ""}"></i></div>
      <button class="btn" data-deliver="${c.id}" ${canDeliver(s, c) ? "" : "disabled"}>Deliver</button>`);
  }
  return rows.length ? `<h3>Goals</h3><div class="target inset">${rows.join("")}</div>` : "";
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
