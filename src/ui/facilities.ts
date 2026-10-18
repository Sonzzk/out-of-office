import { PROJECTS, RECOVER_COST } from "../data/projects";
import { UPGRADES } from "../data/upgrades";
import { buyProject, canBuyProject, canRecover, has, recoverBelongings } from "../sim/projects";
import { buyUpgrade, canUpgrade, nextTier, tier, upkeep } from "../sim/facilities";
import { game, update, watch } from "../store";
import { esc, money } from "./dom";

// Spend money on the building: more crews out, more lab benches, a taller
// radio mast, a security desk and a break room.
export function renderFacilities(body: HTMLElement): void {
  body.classList.add("facilities");
  body.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-buy]");
    if (b) update((s) => void buyUpgrade(s, b.dataset.buy!));
    const p = (e.target as HTMLElement).closest<HTMLElement>("[data-project]");
    if (p) update((s) => void buyProject(s, p.dataset.project!));
    const r = (e.target as HTMLElement).closest<HTMLElement>("[data-recover]");
    if (r) update((s) => void recoverBelongings(s, Number(r.dataset.recover)));
  });
  watch(body, () => {
    const s = game();
    body.innerHTML = `
      <p class="dim">Facilities Management. All improvements are final. Upkeep is billed nightly with payroll.</p>
      <div class="ups">${UPGRADES.map((u) => {
        const t = tier(s, u.id);
        const next = nextTier(s, u.id);
        const now = t ? u.tiers[t - 1].text : "Not installed";
        return `<div class="up inset">
          <img src="./art/icons/${u.icon}" alt="">
          <div class="txt"><b>${esc(u.name)}</b> <span class="pips">${u.tiers.map((_, i) => `<i class="${i < t ? "on" : ""}"></i>`).join("")}</span>
            <div class="dim">${esc(u.blurb)}</div>
            <div>Now: ${esc(now)}${next ? `<br>Next: ${esc(next.text)}` : ""}</div></div>
          ${next ? `<button class="btn" data-buy="${u.id}" ${canUpgrade(s, u.id) ? "" : "disabled"}>Buy ${money(next.cost)}</button>` : `<span class="dim">Fully built</span>`}
        </div>`;
      }).join("")}</div>
      <p class="dim">Nightly upkeep: <b>${money(upkeep(s))}</b></p>
      <h3>Office projects</h3>
      <div class="ups">${PROJECTS.map((p) => `<div class="up inset">
          <div class="txt"><b>${esc(p.name)}</b>
            <div class="dim">${esc(p.blurb)}</div>
            <div>${esc(p.effect)}<br><span class="dim">${esc(p.seen)}</span></div></div>
          ${has(s, p.id) ? `<span class="dim">Built</span>` : `<button class="btn" data-project="${p.id}" ${canBuyProject(s, p.id) ? "" : "disabled"}>Build ${money(p.cost)}</button>`}
        </div>`).join("")}</div>
      ${estates(s)}`;
  });
}

// Lost colleagues' belongings can be bought back from the building.
function estates(s: ReturnType<typeof game>): string {
  const lost = s.crew.filter((w) => w.status === "dead" && !s.recovered?.includes(w.id));
  if (!lost.length) return "";
  return `<h3>Estate recovery</h3><p class="dim">The Index keeps what it takes. For ${money(RECOVER_COST)} it will give some of it back: one valuable item, a calmer building and a little less attention from outside.</p>
    <div class="ups">${lost.map((w) => `<div class="up inset"><div class="txt"><b>${esc(w.name)}</b><div class="dim">Lost on Day ${w.diedOnDay}.</div></div>
      <button class="btn" data-recover="${w.id}" ${canRecover(s, w.id) ? "" : "disabled"}>Recover ${money(RECOVER_COST)}</button></div>`).join("")}</div>`;
}
