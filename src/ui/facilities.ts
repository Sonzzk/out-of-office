import { UPGRADES } from "../data/upgrades";
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
      <p class="dim">Nightly upkeep: <b>${money(upkeep(s))}</b></p>`;
  });
}
