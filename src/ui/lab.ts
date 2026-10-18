import { indexEntry, STAGE_NAME } from "../data/index";
import { ITEMS } from "../data/items";
import { benches } from "../sim/facilities";
import { sellPrice } from "../sim/economy";
import { canResearch, researchPreview, SAMPLES_TO_MASTER, startResearch, stageOf } from "../sim/research";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

// One sample per lab bench. Research it overnight, or sell it in the Ledger. Not both.
export function renderLab(body: HTMLElement): void {
  body.classList.add("lab");
  body.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest<HTMLElement>("[data-research]");
    if (b) update((s) => void startResearch(s, Number(b.dataset.research)));
  });
  watch(body, () => {
    const s = game();
    const samples = s.loot.filter((l) => ITEMS[l.itemId].sampleOf);
    const empty = benches(s) - s.research.length;
    const bench = Array.from({ length: benches(s) }, (_, i) => {
      const r = s.research[i];
      return r
        ? (() => {
            const ent = ITEMS[r.itemId].sampleOf!;
            const st = stageOf(s, ent);
            const next = indexEntry(ent);
            // Same rule as the nightly result, counting samples on earlier benches.
            const ahead = s.research.slice(0, i).filter((x) => ITEMS[x.itemId].sampleOf === ent).length;
            const out = researchPreview(s, ent, ahead);
            const gain = out > st ? (out >= 3 && next.mastered ? `Tonight: ${STAGE_NAME[out]}. Mastered gives: ${next.mastered}` : `Tonight: ${next.name} becomes ${STAGE_NAME[out]}.`) : "Tonight: nothing new to learn.";
            return `<div class="bench inset"><span class="jar full"><img src="${art.item(ITEMS[r.itemId].art)}" alt=""></span>
            <span><b>On the bench:</b> ${esc(ITEMS[r.itemId].name)}<br><span class="dim">${esc(gain)}</span>
            <span class="prog"><i></i></span><span class="dim">Results when you close the books tonight.</span></span></div>`;
          })()
        : `<div class="bench inset dim"><span class="jar"></span><span>Bench ${i + 1} is empty.</span></div>`;
    }).join("");
    const blurb = empty > 0 ? `<p class="dim">Crews sometimes bring back samples from things they survived. Smilers, Hounds and Facelings are the ones worth keeping: studying them makes every crew safer.</p>` : "";
    body.innerHTML = `${bench}${blurb}
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
                  <span class="dim">or sell ${money(sellPrice(l.itemId, s))}</span></div>`;
              })
              .join("")}</div>`
          : `<p class="dim">No samples. Living through an encounter sometimes leaves something behind.</p>`
      }`;
  });
}
