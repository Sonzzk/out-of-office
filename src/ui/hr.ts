import { QUIRKS, SKILL_LABEL, SKILLS, SOURCE_INFO } from "../data/crew";
import { hire, skill, type Worker } from "../sim/crew";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

function skillBars(w: Worker): string {
  return SKILLS.map(
    (s) =>
      `<div class="sk"><span>${SKILL_LABEL[s]}</span><i class="pips">${"■".repeat(skill(w, s))}<b>${"■".repeat(6 - skill(w, s))}</b></i></div>`,
  ).join("");
}

function quirkLine(w: Worker): string {
  const q = QUIRKS.find((x) => x.id === w.quirk)!;
  return `<div class="quirk"><b>${esc(q.name)}.</b> ${esc(q.blurb)}</div>`;
}

export function renderHR(body: HTMLElement): void {
  body.classList.add("hr");
  body.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-hire]");
    if (btn) update((s) => void hire(s, Number(btn.dataset.hire)));
  });
  watch(body, () => {
    const s = game();
    const crew = s.crew.filter((w) => w.status !== "dead");
    const dead = s.crew.filter((w) => w.status === "dead");
    body.innerHTML = `
      <h3>Today's applicants <span class="dim">Day ${s.day}</span></h3>
      <div class="cards">
        ${
          s.pool
            .map(
              (w) => `
          <div class="card inset">
            <img class="pt" src="${art.portrait(w.portrait)}" alt="">
            <div class="info">
              <div class="nm">${esc(w.name)}</div>
              <div class="dim">${SOURCE_INFO[w.source].label}. ${SOURCE_INFO[w.source].pitch}</div>
              ${skillBars(w)}
              ${quirkLine(w)}
              <button class="btn go" data-hire="${w.id}" ${s.cash < w.cost ? "disabled" : ""}>
                ${w.source === "prisoner" ? "Bribe the warden" : "Hire"} · ${money(w.cost)}
              </button>
            </div>
          </div>`,
            )
            .join("") || `<p class="dim">No more applicants today. New ones arrive tomorrow.</p>`
        }
      </div>
      <h3>Your crew</h3>
      ${
        crew.length
          ? `<div class="roster">${crew
              .map(
                (w) => `<div class="row"><img src="${art.portrait(w.portrait)}" alt=""><span class="nm">${esc(w.name)}</span>
                <span class="dim">${w.status === "out" ? "In the field" : w.runs ? `${w.runs} run${w.runs > 1 ? "s" : ""} survived` : "Fresh"}</span></div>`,
              )
              .join("")}</div>`
          : `<p class="dim">Nobody yet. Hire someone above.</p>`
      }
      ${
        dead.length
          ? `<h3>In memoriam</h3><div class="memoriam">${dead
              .map((w) => `<div><b>${esc(w.name)}</b>, deceased, Day ${w.diedOnDay}. <i>"${esc(w.lastWords ?? "...")}"</i></div>`)
              .join("")}</div>`
          : ""
      }`;
  });
}
