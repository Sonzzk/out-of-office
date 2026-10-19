import { LEVEL_XP, SKILL_LABEL, SKILLS, SOURCE_INFO, type Skill } from "../data/crew";
import { ODD_MOODS } from "../data/infection";
import { canTrain, hire, isVeteran, quirkDef, skill, train, trainCost, type Worker } from "../sim/crew";
import { infectionStage } from "../sim/infection";
import { trainWageRise, wage } from "../sim/economy";
import { assign, contractPay, OVERTIME_PAY, OVERTIME_INFECTION } from "../sim/office";
import { game, update, watch } from "../store";
import { shownName } from "../privacy";
import { art, esc, money } from "./dom";
import { notify } from "./uncanny";
import { nextSort, sortCrew, type SortDir, type SortKey } from "./crewsort";

const SKILL_TIP: Record<Skill, string> = {
  nav: "finds the way and finds loot faster",
  stealth: "gets noticed less by what lives down there",
  medical: "keeps the crew alive when something goes wrong",
  morale: "keeps a crew steady when things get strange",
};

// Pips out of six, with the number and a tooltip. Quirks may already be counted in.
function skillBars(w: Worker): string {
  return SKILLS.map((s) => {
    const n = skill(w, s);
    return `<div class="sk" title="${SKILL_LABEL[s]} ${n} of 6: ${SKILL_TIP[s]}."><span>${SKILL_LABEL[s]}</span><i class="pips">${"■".repeat(n)}<b>${"■".repeat(6 - n)}</b></i><em class="dim">${n}</em></div>`;
  }).join("");
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

// Past stage 2 some coworkers start to go off. Which ones is fixed per worker and stage.
function oddMood(w: Worker, stage: number): string {
  if (stage < 3) return "";
  const h = (w.id * 2654435761 + stage * 97) >>> 0;
  if (h % 4 >= stage - 2 + 1) return "";
  return `<div class="quirk warpline"><b>Off.</b> ${esc(ODD_MOODS[h % ODD_MOODS.length])}</div>`;
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

// The applicant list can be folded away so the crew stays in view. Unset means: fold it once there is a crew.
let applicantsOpen: boolean | undefined;

let crewSort: { key: SortKey; dir: SortDir } = { key: "status", dir: "asc" };

const COLUMNS: [SortKey, string][] = [
  ["name", "Name"],
  ["level", "Level"],
  ["status", "Status"],
  ["wage", "Wage/night"],
];

export function renderHR(body: HTMLElement): void {
  body.classList.add("hr");
  body.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-hire]");
    if (btn) update((s) => void hire(s, Number(btn.dataset.hire)));
    const fold = (e.target as HTMLElement).closest("[data-fold]");
    if (fold) {
      const s = game();
      applicantsOpen = !(applicantsOpen ?? s.crew.filter((w) => w.status !== "dead").length < 2);
      update(() => {});
    }
    const th = (e.target as HTMLElement).closest<HTMLElement>("[data-sort]");
    if (th) {
      crewSort = nextSort(crewSort, th.dataset.sort as SortKey);
      update(() => {});
    }
    if ((e.target as HTMLElement).closest("[data-allcontract]"))
      update((s) => {
        for (const w of s.crew) if (w.status === "idle") assign(s, w.id, "contract");
      });
    const course = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-train]");
    if (course)
      update((s) => {
        if (!train(s, Number(course.dataset.train))) return;
        const desk = document.getElementById("desk");
        if (desk) notify(desk, "./art/icons/U-document.png", "Training", s.ledger[0].text.replace("Training course: ", ""), 5000);
      });
    const job = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-job]");
    if (job) update((s) => void assign(s, Number(job.dataset.worker), job.dataset.job as "contract" | "overtime"));
  });
  watch(body, () => {
    const s = game();
    const crew = s.crew.filter((w) => w.status !== "dead");
    const dead = s.crew.filter((w) => w.status === "dead");
    const open = applicantsOpen ?? crew.length < 2;
    body.innerHTML = `
      <h3>Today's applicants <span class="dim">Day ${s.day}</span>
        <button class="btn fold" data-fold aria-expanded="${open}">${open ? "Hide" : `Show ${s.pool.length}`}</button></h3>
      ${open ? "" : `<p class="dim">${s.pool.length ? `${s.pool.length} waiting, from ${money(Math.min(...s.pool.map((w) => w.cost)))}.` : "None today."}</p>`}
      <div class="cards" ${open ? "" : "hidden"}>
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
                ${w.source === "prisoner" ? "Bribe the warden" : "Hire"} · ${money(w.cost)} + ${money(SOURCE_INFO[w.source].wage)}/night
              </button>
              <div class="dim">Wage ${money(SOURCE_INFO[w.source].wage)}/night once hired.</div>
            </div>
          </div>`,
            )
            .join("") || `<p class="dim">No more applicants today. New ones arrive tomorrow.</p>`
        }
      </div>
      <h3>Your crew</h3>
      ${crew.some((w) => w.status === "idle") ? `<p class="dim">Idle crew can take a safe contract (small pay, no risk) or unpaid overtime ($${OVERTIME_PAY}, but the building takes ${OVERTIME_INFECTION}% infection and the room may talk back). Both pay when the books close.</p>` : ""}
      ${
        crew.length
          ? `${crew.filter((w) => w.status === "idle").length > 1 ? `<button class="btn" data-allcontract title="Every idle worker takes a safe contract. No risk, back tonight.">Send all idle to safe contract</button>` : ""}
            <div class="roster"><table class="crewtable"><thead><tr>${COLUMNS.map(
              ([k, label]) =>
                `<th scope="col" aria-sort="${crewSort.key === k ? (crewSort.dir === "asc" ? "ascending" : "descending") : "none"}"><button class="sortbtn" data-sort="${k}" title="Sort by ${label.toLowerCase()}">${label}${crewSort.key === k ? (crewSort.dir === "asc" ? " ▲" : " ▼") : ""}</button></th>`,
            ).join("")}</tr></thead><tbody>${sortCrew(
              crew.map((w) => ({ id: w.id, name: w.name, level: w.level, status: w.status as "idle" | "busy" | "out", wage: wage(w), w })),
              crewSort.key,
              crewSort.dir,
            )
              .map(
                ({ w, wage: pay }) => `<tr class="crewrow">
                <td class="nm"><img src="${art.portrait(w.portrait)}" alt="">${esc(w.name)}${isVeteran(w) ? ` <span class="badge">VETERAN</span>` : ""}</td>
                <td>Lv ${w.level} ${xpBar(w)}</td>
                <td class="dim">${statusText(w)}</td>
                <td>${money(pay)}</td></tr>
                <tr class="crewmore"><td colspan="4">
                  <div class="skills">${skillBars(w)}</div>
                  ${quirkLines(w)}${oddMood(w, infectionStage(s))}
                  ${
                    w.status === "idle"
                      ? `<div class="jobs">${w.level < LEVEL_XP.length ? `<button class="btn" data-train="${w.id}" ${canTrain(s, w) ? "" : "disabled"} title="A course at a hotel with a very long carpet. They reach the next level right away and gain one random stat point. Their wage rises by ${money(trainWageRise(w))} a night.">${w.trainedDay === s.day ? "Trained today" : `Training course ${money(trainCost(w))}, +${money(trainWageRise(w))}/night`}</button>` : ""}<button class="btn" data-job="contract" data-worker="${w.id}" title="Safe work on the lit edge. Back tonight.">Safe contract +${money(contractPay(w))} (out today)</button>
                        <button class="btn" data-job="overtime" data-worker="${w.id}" title="Pays well. Nobody likes the Overtime Room.">Unpaid overtime +${money(OVERTIME_PAY)} (out today)</button></div>`
                      : ""
                  }
                </td></tr>`,
              )
              .join("")}${phantom(s)}</tbody></table></div>`
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

// Deep in the infection, HR lists one more employee than you hired.
function phantom(s: ReturnType<typeof game>): string {
  if (infectionStage(s) < 3) return "";
  return `<tr class="crewrow phantom"><td class="nm">${esc(shownName(s.bossName))}</td><td>Lv ?</td><td class="dim">At your desk</td><td>?</td></tr>
    <tr class="crewmore"><td colspan="4"><div class="quirk"><b>Never left.</b> ${esc(s.catchphrase ?? "")}</div></td></tr>`;
}
