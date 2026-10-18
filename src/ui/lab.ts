import { indexEntry, STAGE_NAME } from "../data/index";
import { ITEMS } from "../data/items";
import { canResearch, SAMPLES_TO_MASTER, startResearch, stageOf } from "../sim/research";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

// One lab bench. Research a sample overnight, or sell it in the Ledger. Not both.
export function renderLab(body: HTMLElement): void {
  body.classList.add("lab");
  body.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-research]");
    if (b) update((s) => void startResearch(s, Number(b.dataset.research)));
  });
  watch(body, () => {
    const s = game();
    const samples = s.loot.filter((l) => ITEMS[l.itemId].sampleOf);
    const bench = s.research
      ? `<div class="bench inset"><img src="${art.item(ITEMS[s.research.itemId].art)}" alt="">
          <span><b>On the bench:</b> ${esc(ITEMS[s.research.itemId].name)}<br><span class="dim">Results when you close the books tonight.</span></span></div>`
      : `<div class="bench inset dim">The bench is empty. Crews sometimes bring back samples from things they survived.</div>`;
    body.innerHTML = `${bench}
      <h3>Samples in storage</h3>
      ${
        samples.length
          ? `<div class="loot">${samples
              .map((l) => {
                const ent = ITEMS[l.itemId].sampleOf!;
                const st = stageOf(s, ent);
                const done = st >= 3;
                return `<div class="row"><img src="${art.item(ITEMS[l.itemId].art)}" alt="">
                  <span class="nm">${esc(ITEMS[l.itemId].name)}<br><span class="dim">${esc(indexEntry(ent).name)}: ${STAGE_NAME[st]}${done ? ", nothing left to learn" : ` (${s.index[ent]?.count ?? 0} of ${SAMPLES_TO_MASTER} studied)`}</span></span>
                  <button class="btn" data-research="${l.id}" ${canResearch(s, l.id) ? "" : "disabled"}>Research</button>
                  <span class="dim">or sell ${money(ITEMS[l.itemId].value)}</span></div>`;
              })
              .join("")}</div>`
          : `<p class="dim">No samples. Living through an encounter sometimes leaves something behind.</p>`
      }`;
  });
}
