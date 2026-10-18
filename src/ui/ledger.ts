import { goalPay, goalText } from "../sim/goals";
import { canDeliver, contractHave, contractText, declineContract, deliver } from "../sim/contracts";
import { twistToday } from "../sim/twists";
import { sfx } from "./audio";
import { ITEMS } from "../data/items";
import { canEndDay, closeWarnings, endDay, noteTargetReached, reservedLoot, sell, sellAllPreview, sellAllWithUndo, sellPrice, undoSale, wage, type SaleSnapshot } from "../sim/economy";
import { upkeep } from "../sim/facilities";
import { DEEP_CLEAN_AMOUNT, DEEP_CLEAN_COST } from "../data/infection";
import { canDeepClean, deepClean } from "../sim/infection";
import { bribe, bribeCost, canBribe } from "../sim/office";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";
import { notify } from "./uncanny";
import { dialog } from "./windows";

// The buyer on the phone after a Sell all. It sits in the Ledger for a few seconds.
const BUYER_LINES = ["Hm. Hm. Fine.", "Put it on the pile. No, the other pile.", "I did not hear that. I will take it.", "Cash. Do not count it in front of me."];
const KEEN_LINES = ["Hm. Hm. Better than fine.", "You caught me on a good day. Do not make it a habit."];
const CHATTER_MS = 4500;
let chatter: { text: string; at: number } | undefined;

// Tell the player right away when the balance first reaches the Board's target.
let toastedYear = -1;
function targetToast(s: ReturnType<typeof game>): void {
  if (s.targetNoted !== s.target.year || toastedYear === s.target.year) return;
  toastedYear = s.target.year;
  const desk = document.getElementById("desk");
  if (desk) notify(desk, "./art/icons/U-envelope.png", "The Board", `Fiscal year ${s.target.year} target reached. Hold the balance until Day ${s.target.deadline}.`);
}

// Sell all asks first, and keeps an undo around for a few seconds afterwards.
const UNDO_MS = 8000;
let confirmSell = false;
let lastSale: { snap: SaleSnapshot; total: number; at: number } | undefined;

function buyerCall(total: number, keen: boolean): void {
  const list = keen ? KEEN_LINES : BUYER_LINES;
  chatter = { text: list[total % list.length], at: Date.now() };
  sfx("ding");
  setTimeout(() => update(() => {}), CHATTER_MS + 50);
}

export function renderLedger(body: HTMLElement): void {
  body.classList.add("ledger");
  if (game().targetNoted === game().target.year) toastedYear = game().target.year; // already told
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const sellBtn = t.closest<HTMLButtonElement>("[data-sell]");
    if (sellBtn) update((s) => (sell(s, Number(sellBtn.dataset.sell)), targetToast(s)));
    if (t.closest("[data-sellall]")) {
      confirmSell = true;
      update(() => {});
    }
    if (t.closest("[data-sellno]")) {
      confirmSell = false;
      update(() => {});
    }
    if (t.closest("[data-sellgo]")) {
      confirmSell = false;
      update((s) => {
        const { total, undo } = sellAllWithUndo(s);
        lastSale = { snap: undo, total, at: Date.now() };
        buyerCall(total, !!twistToday(s) && twistToday(s)!.id === "buyer");
        targetToast(s);
        setTimeout(() => update(() => {}), UNDO_MS + 50);
      });
    }
    if (t.closest("[data-undo]") && lastSale) {
      const snap = lastSale.snap;
      lastSale = undefined;
      update((s) => void undoSale(s, snap));
    }
    const del = t.closest<HTMLButtonElement>("[data-deliver]");
    if (del) update((s) => (deliver(s, Number(del.dataset.deliver)), noteTargetReached(s), targetToast(s)));
    const dec = t.closest<HTMLButtonElement>("[data-decline]");
    if (dec) {
      const c = game().contracts?.find((x) => x.id === Number(dec.dataset.decline));
      if (c) void dialog("Decline contract", `Turn down ${contractText(c)} for ${money(c.reward)}? It will not come back.`, ["Decline", "Keep it"]).then((a) => a === "Decline" && update((s) => void declineContract(s, c.id)));
    }
    if (t.closest("[data-endday]")) closeBooks();
    if (t.closest("[data-bribe]")) update((s) => void bribe(s));
    if (t.closest("[data-clean]")) update((s) => void deepClean(s));
  });
  watch(body, () => {
    const s = game();
    const sale = sellAllPreview(s);
    const held = reservedLoot(s);
    if (confirmSell && !sale.count) confirmSell = false;
    body.innerHTML = `
      ${twistLine(s)}
      <div class="cash inset"><span class="dim">Balance</span><b>${money(s.cash)}</b></div>
      ${buyer()}
      ${goals(s)}
      ${target(s)}
      ${heat(s)}
      ${s.infection >= 10 ? `<div class="heat inset"><div class="dim">Facilities reports the air is <b>${s.infection >= 60 ? "bad" : s.infection >= 30 ? "damp" : "a bit off"}</b>.</div>
        <button class="btn" data-clean ${canDeepClean(s) ? "" : "disabled"}>Book a deep clean (${money(DEEP_CLEAN_COST)}, clears ${DEEP_CLEAN_AMOUNT}%)</button></div>` : ""}
      <h3>Loot on hand${s.loot.length > 1 ? ` <button class="btn" data-sellall ${sale.count ? "" : "disabled"} title="Skips items held for a contract and research samples.">Sell all ${money(sale.total)}</button>` : ""}</h3>
      ${confirmSell ? sellConfirm(sale) : ""}
      ${undoLine(s)}
      ${
        s.loot.length
          ? `<div class="loot">${s.loot
              .map(
                (l) => `<div class="row"><img src="${art.item(ITEMS[l.itemId].art)}" alt="">
                <span class="nm">${esc(ITEMS[l.itemId].name)}<br><span class="dim">found by ${esc(l.foundBy)}${held.contract.has(l.id) ? ` <b class="tag">held for a contract</b>` : held.samples.has(l.id) ? ` <b class="tag">sample</b>` : ""}</span></span>
                <button class="btn" data-sell="${l.id}">Sell ${money(sellPrice(l.itemId, s))}</button></div>`,
              )
              .join("")}</div>`
          : `<p class="dim">Nothing to sell. Send a crew in.</p>`
      }
      <h3>Transactions</h3>
      ${history(s)}
      ${footer(s)}`;
  });
}

// Close the books, after a look at what is still undone.
function closeBooks(): void {
  const warn = closeWarnings(game());
  if (!warn.length) return void update((s) => void endDay(s));
  void dialog("Close the books", `Before you go home:\n\n${warn.map((w) => `- ${w}`).join("\n")}\n\nClose anyway?`, ["Close anyway", "Go back"]).then((a) => a === "Close anyway" && update((s) => void endDay(s)));
}

// Sell all, spelled out: the total, and what stays behind.
function sellConfirm(p: ReturnType<typeof sellAllPreview>): string {
  const kept = [p.keptContract ? `${p.keptContract} for contracts` : "", p.keptSamples ? `${p.keptSamples} research sample${p.keptSamples === 1 ? "" : "s"}` : ""].filter(Boolean);
  return `<div class="sellconfirm inset"><div>Sell <b>${p.count} item${p.count === 1 ? "" : "s"}</b> for <b>${money(p.total)}</b>?${p.priciest && p.priciest.price >= 300 ? ` That includes the ${esc(p.priciest.name)} (${money(p.priciest.price)}).` : ""}
    <span class="dim">${kept.length ? `Keeping ${kept.join(" and ")}.` : "Nothing is held back."}</span></div>
    <div class="acts"><button class="btn go" data-sellgo>Sell</button><button class="btn" data-sellno>Cancel</button></div></div>`;
}

function undoLine(s: ReturnType<typeof game>): string {
  if (!lastSale || Date.now() - lastSale.at > UNDO_MS || s.ledger.length !== lastSale.snap.after) return "";
  return `<div class="sellconfirm inset"><span>Sold for ${money(lastSale.total)}.</span><button class="btn" data-undo>Undo</button></div>`;
}

// Transactions by day, each day with its net.
function history(s: ReturnType<typeof game>): string {
  const rows: string[] = [];
  let day = -1;
  for (const e of s.ledger.slice(0, 40)) {
    if (e.day !== day) {
      day = e.day;
      const net = s.ledger.filter((x) => x.day === day).reduce((a, x) => a + x.amount, 0);
      rows.push(`<tr class="dayhead"><td colspan="2">Day ${day}</td><td class="${net < 0 ? "neg" : "pos"}" title="Net for the day">${net > 0 ? "+" : ""}${money(net)}</td></tr>`);
    }
    rows.push(`<tr><td></td><td>${esc(e.text)}</td><td class="${e.amount < 0 ? "neg" : "pos"}">${money(e.amount)}</td></tr>`);
  }
  return `<table class="tx inset">${rows.join("")}</table>`;
}

// Always in view: where the money stands, what tonight will cost, and the way to end the day.
function footer(s: ReturnType<typeof game>): string {
  const pay = s.crew.filter((w) => w.status !== "dead").reduce((a, w) => a + wage(w), 0);
  const rent = upkeep(s);
  const night = -(pay + rent);
  return `<div class="closebar">
    <div class="figs"><span class="dim">Balance</span><b>${money(s.cash)}</b>
      <span class="dim" title="Payroll ${money(pay)}${rent ? `, upkeep ${money(rent)}` : ""}. Sales and the lab are not counted.">Tonight, before sales</span><b class="${night < 0 ? "neg" : ""}">${money(night)}</b></div>
    <button class="btn go" data-endday ${canEndDay(s) ? "" : "disabled"}>Close the books (end Day ${s.day})</button>
    ${canEndDay(s) ? "" : `<div class="dim">A crew is still out. You can't go home yet.</div>`}
  </div>`;
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
    const market = sellPrice(c.itemId, s) * c.need;
    rows.push(`<div class="dim">Contract: <b>${esc(contractText(c))}</b> for ${money(c.reward)} <span title="What the same items sell for in the Ledger today.">(market value now ${money(market)}, ${c.reward >= market ? `${money(c.reward - market)} over` : `${money(market - c.reward)} under`})</span>, by Day ${c.deadline} (${left <= 0 ? "last day" : left === 1 ? "1 day left" : `${left} days left`}). (${have}/${c.need})</div>
      <div class="bar"><i style="width:${Math.round((100 * have) / c.need)}%" class="${canDeliver(s, c) ? "met" : ""}"></i></div>
      <div class="acts"><button class="btn" data-deliver="${c.id}" ${canDeliver(s, c) ? "" : "disabled"}>Deliver</button>
      <button class="btn" data-decline="${c.id}" title="Turn the offer down and free the slot.">Decline</button></div>`);
  }
  return rows.length ? `<h3>Goals</h3><div class="target inset">${rows.join("")}</div>` : "";
}

// The Board's target for this fiscal year, as a progress bar.
function target(s: ReturnType<typeof game>): string {
  const t = s.target;
  const pct = Math.max(0, Math.min(100, Math.round((100 * s.cash) / t.amount)));
  const days = t.deadline - s.day;
  const when = days <= 0 ? "due tonight" : days === 1 ? "due tomorrow" : `${days} days left`;
  const met = s.cash >= t.amount;
  return `<div class="target inset"><div class="dim">Fiscal year ${t.year} target: <b>${money(t.amount)}</b> in the bank by Day ${t.deadline} (${when})</div>
    <div class="bar"><i style="width:${pct}%" class="${met ? "met" : ""}"></i></div>
    <div class="dim">${met ? `Reached for now. The Board only looks on the morning of Day ${t.deadline}, so keep the balance up.` : `The bar shows your balance. If it is short on the morning of Day ${t.deadline}, the Board adds three days and writes you a memo. Nothing else, so far.`}</div></div>`;
}

// Heat, and the discreet way to lower it.
function heat(s: ReturnType<typeof game>): string {
  const mood = s.heat >= 80 ? "An inspection is coming." : s.heat >= 60 ? "People are asking questions." : s.heat >= 30 ? "Some talk in town." : "Nobody is looking.";
  return `<div class="heat inset"><div class="dim">Heat: <b>${s.heat}%</b>. ${mood}</div>
    <div class="bar"><i style="width:${s.heat}%"></i></div>
    ${s.heat >= 10 ? `<button class="btn" data-bribe ${canBribe(s) ? "" : "disabled"}>Donate to the inspector's retirement fund (${money(bribeCost(s))})</button>` : ""}</div>`;
}
