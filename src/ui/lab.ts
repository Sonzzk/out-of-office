import { indexEntry, STAGE_NAME } from "../data/index";
import { ITEMS } from "../data/items";
import { benches } from "../sim/facilities";
import { canResearch, SAMPLES_TO_MASTER, startResearch, stageOf } from "../sim/research";
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
    const bench = Array.from({ length: benches(s) }, (_, i) => {
      const r = s.research[i];
      return r
        ? (() => {
            const ent = ITEMS[r.itemId].sampleOf!;
            const st = stageOf(s, ent);
            const next = indexEntry(ent);
            const gain = st + 1 >= 3 && next.mastered ? `Mastered gives: ${next.mastered}` : `Next stage: ${STAGE_NAME[Math.min(3, st + 1)]}.`;
            return `<div class="bench inset"><span class="jar full"><img src="${art.item(ITEMS[r.itemId].art)}" alt=""></span>
            <span><b>On the bench:</b> ${esc(ITEMS[r.itemId].name)}<br><span class="dim">${esc(gain)}</span>
            <span class="prog"><i></i></span><span class="dim">Results when you close the books tonight.</span></span></div>`;
          })()
        : `<div class="bench inset dim"><span class="jar"></span><span>Bench ${i + 1} is empty.<br>Crews sometimes bring back samples from things they survived. Smilers, Hounds and Facelings are the ones worth keeping: studying them makes every crew safer.</span></div>`;
    }).join("");
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
