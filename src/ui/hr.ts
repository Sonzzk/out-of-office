import { LEVEL_XP, SKILL_LABEL, SKILLS, SOURCE_INFO } from "../data/crew";
import { hire, isVeteran, quirkDef, skill, type Worker } from "../sim/crew";
import { assign, contractPay, OVERTIME_PAY } from "../sim/office";
import { game, update, watch } from "../store";
import { art, esc, money } from "./dom";

function skillBars(w: Worker): string {
  return SKILLS.map(
    (s) =>
      `<div class="sk"><span>${SKILL_LABEL[s]}</span><i class="pips">${"■".repeat(skill(w, s))}<b>${"■".repeat(6 - skill(w, s))}</b></i></div>`,
  ).join("");
}

function quirkLines(w: Worker): string {
  const known = w.revealed.map((id) => {
    const q = quirkDef(id);
    return `<div class="quirk"><b>${esc(q.name)}.</b> ${esc(q.blurb)}</div>`;
  });
  const unknown = w.quirks.length - w.revealed.length;
  if (unknown > 0) known.push(`<div class="quirk dim">+${unknown} undisclosed. HR is still finding out.</div>`);
  return known.join("");
}

function xpBar(w: Worker): string {
  if (w.level >= LEVEL_XP.length) return `<span class="dim">Max level</span>`;
  const from = LEVEL_XP[w.level - 1];
  const to = LEVEL_XP[w.level];
  const pct = Math.round((100 * (w.xp - from)) / (to - from));
  return `<span class="xp" title="${w.xp - from}/${to - from} xp to level ${w.level + 1}"><i style="width:${pct}%"></i></span>`;
}

function statusText(w: Worker): string {
  if (w.status === "out") return "In the field";
  if (w.status === "busy") return w.assignment === "overtime" ? "In the Overtime Room" : "On a safe contract";
  return w.runs ? `${w.runs} run${w.runs > 1 ? "s" : ""} survived` : "Fresh";
}

export function renderHR(body: HTMLElement): void {
  body.classList.add("hr");
  body.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-hire]");
    if (btn) update((s) => void hire(s, Number(btn.dataset.hire)));
    const job = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-job]");
    if (job) update((s) => void assign(s, Number(job.dataset.worker), job.dataset.job as "contract" | "overtime"));
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
              ${quirkLines(w)}
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
                (w) => `<div class="crewrow inset">
                <img src="${art.portrait(w.portrait)}" alt="">
                <div class="info">
                  <div class="top"><span class="nm">${esc(w.name)}</span>
                    <span class="lv">Lv ${w.level}</span>${isVeteran(w) ? `<span class="badge">VETERAN</span>` : ""}
                    ${xpBar(w)}<span class="dim st">${statusText(w)}</span></div>
                  ${skillBars(w)}
                  ${quirkLines(w)}
                  ${
                    w.status === "idle"
                      ? `<div class="jobs"><button class="btn" data-job="contract" data-worker="${w.id}" title="Safe work on the lit edge. Back tonight.">Safe contract +${money(contractPay(w))}</button>
                        <button class="btn" data-job="overtime" data-worker="${w.id}" title="Pays well. Nobody likes the Overtime Room.">Unpaid overtime +${money(OVERTIME_PAY)}</button></div>`
                      : ""
                  }
                </div></div>`,
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
