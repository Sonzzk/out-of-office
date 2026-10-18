import { CALLS, THREAT_OPTIONS } from "../data/calls";
import { entityDef } from "../data/entities";
import { levelDef } from "../data/levels";
import { answerCall, answerThreat, levelOf, running, type Expedition } from "../sim/expedition";
import { game, update, watch } from "../store";
import { esc } from "./dom";
import { createBodycam, type Bodycam, type CamInput } from "./bodycam";
import { scrub } from "../privacy";

// Feeds Wall: one live body cam per crew that is out, side by side. A tile
// flashes when its crew is waiting for a word, and clicking it lets you answer
// from here. When nobody is out, the wall can replay the last run.
export function renderFeeds(body: HTMLElement): void {
  body.classList.add("feeds");
  const tiles = new Map<number, { cam: Bodycam; canvas: HTMLCanvasElement }>();
  let focus: number | null = null;
  let shownKey = "";
  let replay: { exp: Expedition; i: number; timer: number; cam?: Bodycam } | null = null;

  const camInput = (exp: Expedition): CamInput => {
    const s = game();
    const lead = s.crew.find((w) => w.id === exp.leadId) ?? s.crew.find((w) => exp.crewIds.includes(w.id));
    return {
      lv: levelOf(s, exp.levelId),
      exp,
      operator: lead?.name ?? "Crew",
      day: s.day,
      infection: s.infection,
      taken: s.takenToday[exp.levelId] ?? [],
      levelName: levelDef(exp.levelId).name,
      depth: levelDef(exp.levelId).depth,
      mates: exp.crewIds.filter((id) => id !== lead?.id).map((id) => s.crew.find((w) => w.id === id)).filter((w) => w?.status === "out").map((w) => w!.portrait),
    };
  };

  const lastRun = () => [...game().expeditions].reverse().find((e) => e.phase === "done" && e.trace?.length);

  const stateLabel = (exp: Expedition) => (exp.threat ? "CONTACT" : exp.call ? "CALL" : exp.phase === "return" ? "COMING BACK" : "HEADING IN");

  body.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    const answer = t.closest<HTMLElement>("[data-answer]");
    const threat = t.closest<HTMLElement>("[data-threat]");
    const exp = focus === null ? undefined : running(game()).find((e) => e.id === focus);
    if (answer && exp) return void update((s) => void answerCall(s, exp, Number(answer.dataset.answer)));
    if (threat && exp) return void update((s) => void answerThreat(s, exp, Number(threat.dataset.threat)));
    if (t.closest("[data-wall]")) {
      focus = null;
      return render();
    }
    if (t.closest("[data-replay]")) return startReplay();
    if (t.closest("[data-stop]")) return stopReplay();
    const tile = t.closest<HTMLElement>(".tile[data-run]");
    if (tile && !t.closest("button")) {
      focus = focus === Number(tile.dataset.run) ? null : Number(tile.dataset.run);
      render();
    }
  });

  function startReplay(): void {
    const exp = lastRun();
    if (!exp) return;
    stopReplay();
    replay = { exp, i: 0, timer: window.setInterval(stepReplay, 275) };
    render();
  }
  function stopReplay(): void {
    if (replay) clearInterval(replay.timer);
    replay = null;
    render();
  }
  // A replay rebuilds the run from its trace, one recorded step at a time.
  function stepReplay(): void {
    if (!replay) return;
    if (!body.isConnected) return void (replay && clearInterval(replay.timer));
    const { exp } = replay;
    const trace = exp.trace!;
    const step = trace[Math.min(replay.i, trace.length - 1)];
    const synthetic: Expedition = {
      ...exp,
      pos: { x: step[0], y: step[1] },
      tick: replay.i,
      phase: replay.i >= trace.length - 1 ? "done" : "in",
      call: undefined,
      threat: undefined,
      entities: exp.entities.map((r, k) => ({ ...r, pos: { x: step[2 + 2 * k] ?? r.pos.x, y: step[3 + 2 * k] ?? r.pos.y } })),
      carried: [],
    };
    replay.cam?.update(camInput(synthetic));
    if (replay.i < trace.length + 6) replay.i++;
    else stopReplay();
  }

  function render(): void {
    const runs = running(game());
    if (focus !== null && !runs.some((e) => e.id === focus)) focus = null;
    const key = `${runs.map((e) => e.id).join(",")}|${focus}|${replay ? "r" : ""}|${replay ? "" : lastRun() ? "L" : ""}`;
    if (key !== shownKey) {
      shownKey = key;
      tiles.clear();
      body.innerHTML = layout(runs);
      for (const exp of runs) {
        const canvas = body.querySelector<HTMLCanvasElement>(`.tile[data-run="${exp.id}"] canvas`)!;
        tiles.set(exp.id, { canvas, cam: createBodycam(canvas, camInput(exp), { fps: focus === exp.id ? 30 : 12 }) });
      }
      if (replay) {
        const canvas = body.querySelector<HTMLCanvasElement>(".tile.replay canvas");
        if (canvas) {
          const first = camInput({ ...replay.exp, tick: 0, pos: { x: replay.exp.trace![0][0], y: replay.exp.trace![0][1] }, carried: [], phase: "in" });
          replay.cam = createBodycam(canvas, first, { fps: 24 });
        }
      }
    }
    for (const exp of runs) {
      const tile = body.querySelector<HTMLElement>(`.tile[data-run="${exp.id}"]`);
      if (!tile) continue;
      tiles.get(exp.id)?.cam.update(camInput(exp));
      tile.classList.toggle("alert", !!(exp.call || exp.threat));
      tile.classList.toggle("threat", !!exp.threat);
      tile.querySelector(".state")!.textContent = stateLabel(exp);
    }
    if (focus !== null) fillDetail(runs.find((e) => e.id === focus)!);
  }

  function layout(runs: Expedition[]): string {
    if (replay) {
      return `<div class="wall one"><div class="tile replay"><canvas class="bodycam"></canvas><div class="lbl"><i class="led"></i>REPLAY</div><div class="state">LAST RUN</div></div></div>
        <div class="bar"><button class="btn" data-stop>Stop replay</button><span class="dim">Playing back the last run at twice the speed.</span></div>`;
    }
    if (!runs.length) {
      return `<div class="nofeed"><div class="static"></div><b>NO ACTIVE FEEDS</b>
        <span class="dim">Send a crew out from the Facility Map and their body cams show up here.</span>
        ${lastRun() ? `<button class="btn go" data-replay>Replay the last run</button>` : ""}</div>`;
    }
    const tile = (e: Expedition) => {
      const s = game();
      const lead = s.crew.find((w) => w.id === e.leadId);
      return `<div class="tile ${focus === e.id ? "big" : ""}" data-run="${e.id}"><canvas class="bodycam"></canvas>
        <div class="lbl"><i class="led"></i>${esc(lead ? lead.name : "Crew")}</div><div class="state"></div></div>`;
    };
    return `<div class="wall n${Math.min(runs.length, 6)}${focus !== null ? " focused" : ""}">${runs.map(tile).join("")}</div>
      ${focus !== null ? `<div class="detail"></div><div class="bar"><button class="btn" data-wall>Back to the wall</button></div>` : `<div class="bar dim">Click a feed to enlarge it and answer from here.${lastRun() ? ` <button class="btn" data-replay>Replay the last run</button>` : ""}</div>`}`;
  }

  // The enlarged feed: the last few radio lines and the question, if one is waiting.
  function fillDetail(exp: Expedition): void {
    const box = body.querySelector<HTMLElement>(".detail");
    if (!box) return;
    const key = `${exp.call ? exp.call.id + exp.call.asked : ""}|${exp.threat ? exp.threat.id + exp.threat.asked : ""}|${exp.log.length}`;
    if (box.dataset.key === key) return;
    box.dataset.key = key;
    const lines = exp.log.slice(-5).map((l) => `<p>${esc(scrub(l, game().bossName))}</p>`).join("");
    let ask = "";
    if (exp.threat)
      ask = `<div class="opts">${THREAT_OPTIONS.map((o, i) => `<button class="btn ${i === 0 ? "go" : ""}" data-threat="${i}">${esc(o)}</button>`).join("")}</div>
        <b>${esc(entityDef(exp.threat.id).name)} is close.</b>`;
    else if (exp.call) {
      const def = CALLS.find((c) => c.id === exp.call!.id)!;
      ask = `<div class="opts">${def.options.map((o, i) => `<button class="btn ${i === 0 ? "go" : ""}" data-answer="${i}">${esc(o)}</button>`).join("")}</div>`;
    }
    box.innerHTML = `${ask}<div class="radio inset">${lines}</div>`;
  }

  watch(body, render, ["all", "tick"]);
}
