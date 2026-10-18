import { INDEX, STAGE_NAME, type IndexEntry, type IndexKind } from "../data/index";
import { HEAT_PER_DATA_SALE } from "../sim/office";
import { dataPrice, indexProgress, sellData, stageOf } from "../sim/research";
import { game, update, watch } from "../store";
import { esc, money } from "./dom";

const TABS: { kind: IndexKind; label: string }[] = [
  { kind: "entity", label: "Entities" },
  { kind: "level", label: "Levels" },
  { kind: "item", label: "Items" },
];

// Which entries the list shows. Sellable ones have data a collector would buy.
const FILTERS = [
  { id: "all", label: "All" },
  { id: "found", label: "Found" },
  { id: "unknown", label: "Unknown" },
  { id: "sellable", label: "Sellable" },
] as const;
type Filter = (typeof FILTERS)[number]["id"];

// The Index: the company's field guide. Unknown entries are blank, Seen ones
// are silhouettes, Documented ones explain how to survive, Mastered ones add lore.
export function renderIndex(body: HTMLElement): void {
  body.classList.add("index");
  let tab: IndexKind = "entity";
  let open = "smiler";
  let filter: Filter = "all";
  body.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const tabBtn = t.closest<HTMLElement>("[data-tab]");
    const card = t.closest<HTMLElement>("[data-entry]");
    const filterBtn = t.closest<HTMLElement>("[data-filter]");
    const sellBtn = t.closest<HTMLElement>("[data-selldata]");
    if (filterBtn) {
      filter = filterBtn.dataset.filter as Filter;
      render();
    } else if (tabBtn) {
      tab = tabBtn.dataset.tab as IndexKind;
      open = INDEX.find((x) => x.kind === tab)!.id;
      render();
    } else if (card) {
      open = card.dataset.entry!;
      render();
    } else if (sellBtn) update((s) => void sellData(s, sellBtn.dataset.selldata!));
  });

  function render(): void {
    const s = game();
    const p = indexProgress(s);
    const entries = INDEX.filter((x) => x.kind === tab && shows(s, x));
    body.innerHTML = `
      <div class="tabs">${TABS.map((t) => `<button class="tab ${t.kind === tab ? "on" : ""}" data-tab="${t.kind}">${t.label}</button>`).join("")}
        <span class="dim prog">${p.found} of ${p.total} entries</span></div>
      <div class="split">
        <div class="list inset"><div class="filters" role="toolbar" aria-label="Filter entries">${FILTERS.map((f) => `<button class="tab ${f.id === filter ? "on" : ""}" data-filter="${f.id}" aria-pressed="${f.id === filter}">${f.label}</button>`).join("")}</div>
          ${entries.length ? entries.map((x) => card(x, stageOf(s, x.id), x.id === open)).join("") : `<p class="dim">Nothing matches.</p>`}</div>
        <div class="page inset">${page(INDEX.find((x) => x.id === open)!)}</div>
      </div>`;
  }

  function shows(s: ReturnType<typeof game>, x: IndexEntry): boolean {
    if (filter === "found") return stageOf(s, x.id) > 0;
    if (filter === "unknown") return stageOf(s, x.id) === 0;
    if (filter === "sellable") return dataPrice(s, x.id) > 0;
    return true;
  }

  function card(x: IndexEntry, stage: number, on: boolean): string {
    const name = stage ? x.name.replace(/^Level 0: /, "") : "???";
    return `<button class="card ${on ? "on" : ""} st${stage}" data-entry="${x.id}">
      ${stage ? `<img src="./art/${x.art}" alt="">` : `<span class="blank">?</span>`}
      <span>${esc(name)}<br><span class="dim">${STAGE_NAME[stage]}</span></span></button>`;
  }

  function page(x: IndexEntry): string {
    const s = game();
    const stage = stageOf(s, x.id);
    if (!stage) return `<p class="dim">No record. Nobody has come back with anything about this yet.</p>`;
    const k = s.index[x.id];
    const by = k.by ? s.crew.find((w) => w.name === k.by) : undefined;
    const byLine = k.by ? `${esc(k.by)}${by?.status === "dead" ? ", deceased" : ""}` : "Company records";
    const price = dataPrice(s, x.id);
    const next =
      x.kind === "entity"
        ? stage < 2 ? "Live through an encounter, or research a sample in the Lab." : "Research two samples in the Lab."
        : x.kind === "item" ? "Bring three home." : stage < 2 ? "Survey half of the level." : "Survey nine tenths of the level.";
    return `
      <div class="hero st${stage}"><img src="./art/${x.art}" alt=""></div>
      <h3>${esc(x.name)}</h3>
      <div class="meta"><span>Class ${x.cls}</span><span>${esc(x.difficulty)}</span><span class="stage">${STAGE_NAME[stage]}</span></div>
      <p>${esc(x.description)}</p>
      <p><b>Where:</b> ${esc(x.where)}</p>
      ${stage >= 2 ? `<p><b>How to survive:</b> ${esc(x.avoid)}</p>` : `<p class="dim"><b>How to survive:</b> [needs Documented]</p>`}
      ${x.mastered ? (stage >= 3 ? `<p><b>Mastered:</b> ${esc(x.mastered)}</p>` : `<p class="dim"><b>Mastered:</b> ${esc(x.mastered)}</p>`) : ""}
      ${x.lore && stage >= 3 ? `<p class="lore">${esc(x.lore)}</p>` : ""}
      <p class="dim">Discovered by ${byLine}.${stage < x.maxStage ? ` Next stage: ${next}` : ""}</p>
      ${price ? `<button class="btn" data-selldata="${x.id}">Sell the data to collectors (${money(price)}, +${HEAT_PER_DATA_SALE} Heat)</button>
        <p class="dim">Collectors talk. Selling data raises the office's Heat by ${HEAT_PER_DATA_SALE}.</p>` : ""}`;
  }

  watch(body, render);
}
