import { ITEMS } from "../data/items";
import { isVeteran } from "../sim/crew";
import { CALLS } from "../data/calls";
import { radioStatic, sfx } from "./audio";
import { entityDef } from "../data/entities";
import { GEAR, gearDef } from "../data/gear";
import { LEVELS, levelDef } from "../data/levels";
import { indexEntry } from "../data/index";
import { crewSlots } from "../sim/facilities";
import { surveyed, isUnlocked } from "../sim/research";
import { answerCall, callTicks, levelOf, MAX_CREW, oddsWord, running, startExpedition, suggestLead, type Expedition } from "../sim/expedition";
import { DARK, FLOOR, idx, type Pt } from "../sim/level";
import { game, update, watch, type Topic } from "../store";
import { art, esc } from "./dom";

// Facility Map: plan a run by picking a level, a crew and a marker,
// then watch it play out on the same schematic with the radio log beside it.
export function renderExpedition(body: HTMLElement): void {
  body.classList.add("expo");
  body.innerHTML = `
    <div class="mapwrap"><canvas class="map"></canvas></div>
    <div class="side"></div>`;
  const canvas = body.querySelector("canvas")!;
  const side = body.querySelector<HTMLElement>(".side")!;
  let marker: Pt | null = null;
  const picked = new Set<number>();
  let leadId: number | null = null;
  const dismissed = new Set<number>(); // finished runs whose debrief was closed
  let selected: number | null = null; // the run shown in the side panel
  let planning = false; // planning a second run while one is out
  let planLevel = "level-0";
  const packed = new Set<string>(); // gear for the next run

  // Runs still worth showing: out in the field, or finished with an unread debrief.
  const visible = (): Expedition[] => game().expeditions.filter((e) => !dismissed.has(e.id));
  const current = (): Expedition | undefined => {
    if (planning) return undefined;
    const runs = visible();
    return runs.find((e) => e.id === selected) ?? runs[runs.length - 1];
  };
  const canPlan = () => running(game()).length < crewSlots(game());
  const shownLevel = () => current()?.levelId ?? planLevel;

  canvas.addEventListener("click", (ev) => {
    if (current() || !canPlan()) return;
    const lv = levelOf(game(), planLevel);
    const r = canvas.getBoundingClientRect();
    const cell = cellSize(canvas, lv);
    const ox = (canvas.width - cell * lv.w) / 2;
    const oy = (canvas.height - cell * lv.h) / 2;
    const scale = canvas.width / r.width;
    const x = Math.floor(((ev.clientX - r.left) * scale - ox) / cell);
    const y = Math.floor(((ev.clientY - r.top) * scale - oy) / cell);
    if (x >= 0 && y >= 0 && x < lv.w && y < lv.h) {
      marker = { x, y };
      draw();
      renderSide();
    }
  });

  body.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    const pickLevel = t.closest<HTMLElement>("[data-level]");
    if (pickLevel) {
      if (pickLevel.dataset.level !== planLevel) marker = null;
      planLevel = pickLevel.dataset.level!;
      renderSide();
      draw();
      return;
    }
    const tab = t.closest<HTMLElement>("[data-run]");
    if (tab) {
      planning = tab.dataset.run === "plan";
      selected = planning ? null : Number(tab.dataset.run);
      renderSide();
      draw();
      return;
    }
    const answer = t.closest<HTMLElement>("[data-answer]");
    if (answer) {
      const exp = current();
      if (exp) update((s) => void answerCall(s, exp, Number(answer.dataset.answer)));
      return;
    }
    const leadBox = t.closest<HTMLInputElement>("input[data-lead]");
    if (leadBox) {
      leadId = Number(leadBox.dataset.lead);
      renderSide();
      return;
    }
    const gearBox = t.closest<HTMLInputElement>("input[data-gear]");
    if (gearBox) {
      if (gearBox.checked) packed.add(gearBox.dataset.gear!);
      else packed.delete(gearBox.dataset.gear!);
      renderSide();
      return;
    }
    const box = t.closest<HTMLInputElement>("input[data-pick]");
    if (box) {
      const id = Number(box.dataset.pick);
      if (box.checked) picked.add(id);
      else picked.delete(id);
      renderSide();
      return;
    }
    if (t.closest("[data-send]") && marker) {
      const m = marker;
      const lead = leadId ?? undefined;
      update((s) => {
        const exp = startExpedition(s, [...picked], m, lead, planLevel, [...packed]);
        if (exp) selected = exp.id;
      });
      planning = false;
      picked.clear();
      packed.clear();
      leadId = null;
      marker = null;
    }
    if (t.closest("[data-dismiss]")) {
      const exp = current();
      if (exp) dismissed.add(exp.id);
      selected = null;
      renderSide();
      draw();
    }
  });

  function tabs(): string {
    const s = game();
    const runs = visible();
    if (!runs.length) return "";
    const exp = current();
    const label = (e: Expedition) => {
      const lead = s.crew.find((w) => w.id === e.leadId)!;
      const state = e.call ? `<b class="ring">CALL</b>` : e.phase === "done" ? "back" : "out";
      return `L${levelDef(e.levelId).depth} ${esc(lead.name.split(" ")[0])}${e.crewIds.length > 1 ? ` +${e.crewIds.length - 1}` : ""} · ${state}`;
    };
    return `<div class="runtabs">${runs
      .map((e) => `<button class="tab ${exp?.id === e.id ? "on" : ""}" data-run="${e.id}">${label(e)}</button>`)
      .join("")}${canPlan() ? `<button class="tab ${!exp ? "on" : ""}" data-run="plan">+ New run</button>` : ""}</div>`;
  }

  function renderSide(): void {
    const s = game();
    const exp = current();
    if (exp) return renderRun(exp);
    if (!canPlan()) {
      side.innerHTML = `${tabs()}<p class="dim">Both crews are out. Pick a run above to listen in.</p>`;
      return;
    }
    const idle = s.crew.filter((w) => w.status === "idle");
    for (const id of [...picked]) if (!idle.some((w) => w.id === id)) picked.delete(id);
    const team = idle.filter((w) => picked.has(w.id));
    if (leadId === null || !picked.has(leadId)) leadId = team.length ? suggestLead(team).id : null;
    const full = picked.size >= MAX_CREW;
    const def = levelDef(planLevel);
    side.innerHTML = `${tabs()}
      <div class="levels">${LEVELS.map((l) =>
        isUnlocked(s, l.id)
          ? `<button class="tab ${l.id === planLevel ? "on" : ""}" data-level="${l.id}" title="${esc(l.name)}">L${l.depth}</button>`
          : `<button class="tab" disabled title="Document Level ${l.depth - 1} to open this">L${l.depth}</button>`,
      ).join("")}</div>
      <img class="lvl" src="${art.level(def.art)}" alt="">
      <div class="lvname"><b>Level ${def.depth}</b> · ${esc(def.name)}<br><span class="dim">Class ${indexEntry(def.id).cls}. ${esc(def.blurb)}</span></div>
      <h4>1. Pick a crew</h4>
      ${
        idle.length
          ? idle
              .map(
                (w) => `<div class="pick"><label><input type="checkbox" data-pick="${w.id}" ${picked.has(w.id) ? "checked" : ""}
                  ${full && !picked.has(w.id) ? "disabled" : ""}>
                <img src="${art.portrait(w.portrait)}" alt="">${esc(w.name)} <span class="dim">Lv ${w.level}${isVeteran(w) ? " ★" : ""}</span></label>
                ${picked.has(w.id) && picked.size > 1 ? `<label class="lead"><input type="radio" name="lead" data-lead="${w.id}" ${leadId === w.id ? "checked" : ""}>Lead</label>` : ""}</div>`,
              )
              .join("")
          : `<p class="dim">Nobody available. Hire someone in HR Roster.</p>`
      }
      ${picked.size ? `<p class="dim">Up to ${MAX_CREW}. The team lead decides when to turn back.</p>` : ""}
      <h4>2. Drop a marker</h4>
      <p class="dim">${marker ? "Marker set. Click the map to move it." : "Click anywhere on the map. Dark areas are unexplored."}</p>
      <h4>3. Pack gear <span class="dim">(optional, used up)</span></h4>
      <div class="gear">${GEAR.map((g) => {
        const spent = [...packed].filter((id) => id !== g.id).reduce((a, id) => a + gearDef(id).cost, 0);
        const can = packed.has(g.id) || s.cash - spent >= g.cost;
        return `<label title="${esc(g.blurb)}"><input type="checkbox" data-gear="${g.id}" ${packed.has(g.id) ? "checked" : ""} ${can ? "" : "disabled"}>
          <img src="${art.item(g.art)}" alt="">${esc(g.name)} <span class="dim">$${g.cost}</span></label>`;
      }).join("")}</div>
      <div class="odds">Survival odds: <b>${picked.size ? oddsWord(s, [...picked]) : "..."}</b></div>
      <button class="btn go big" data-send ${picked.size && marker ? "" : "disabled"}>Send them in</button>`;
  }

  let logCount = 0;
  function renderRun(exp: Expedition): void {
    const s = game();
    const crew = exp.crewIds.map((id) => s.crew.find((w) => w.id === id)!);
    const phase =
      exp.phase === "done"
        ? exp.result!.survivors
          ? "Back at the door"
          : "Signal lost"
        : exp.phase === "in"
          ? "Heading in"
          : "Coming back";
    const head = `
      <div class="runhead"><b>${phase}</b>${exp.gear.length ? `<span class="kits">${exp.gear.map((g) => `<img class="kit${exp.used.includes(g) ? " used" : ""}" src="${art.item(gearDef(g).art)}" title="${esc(gearDef(g).name)}${exp.used.includes(g) ? " (used)" : ""}" alt="">`).join("")}</span>` : ""}<span class="dim">${exp.carried.length ? exp.carried.map((i) => esc(ITEMS[i].name)).join(", ") : "Nothing found yet"}</span></div>
      <div class="crewline">${crew
        .map((w) => `<span class="${w.status === "dead" ? "gone" : ""}" title="${esc(w.name)}"><img src="${art.portrait(w.portrait)}" alt=""></span>`)
        .join("")}</div>`;
    const debrief =
      exp.phase === "done"
        ? `<div class="debrief inset">${
            exp.result!.survivors
              ? `${exp.result!.survivors} came back with ${exp.result!.loot.length ? exp.result!.loot.length + " item" + (exp.result!.loot.length > 1 ? "s" : "") + " to sell in the Ledger" : "nothing"}.`
              : "Nobody came back. Neither did the loot."
          }${exp.result!.dead.length ? `<br>Lost: ${exp.result!.dead.map(esc).join(", ")}. HR has sent a memo.` : ""}
          ${exp.result!.notes.map((n) => `<br>${esc(n)}`).join("")}</div>
          <button class="btn go" data-dismiss>Plan the next run</button>`
        : "";
    side.innerHTML = `${tabs()}${head}<div class="radio inset" aria-live="polite"></div><div class="callbox"></div>${debrief}`;
    logCount = 0;
    appendLog(exp);
    renderCall(exp);
  }

  // A question from the crew, with the time left before the lead decides.
  function renderCall(exp: Expedition): void {
    const box = side.querySelector<HTMLElement>(".callbox");
    if (!box) return;
    if (!exp.call) {
      box.innerHTML = "";
      radioStatic(false);
      return;
    }
    const def = CALLS.find((c) => c.id === exp.call!.id)!;
    const left = Math.max(0, callTicks(exp) - (exp.tick - exp.call.asked));
    const pct = Math.round((100 * left) / callTicks(exp));
    if (!box.querySelector(".call")) {
      radioStatic(true);
      box.innerHTML = `<div class="call inset"><b>The crew is waiting for your call</b>
        <div class="opts">${def.options.map((o, i) => `<button class="btn ${i === 0 ? "go" : ""}" data-answer="${i}">${esc(o)}</button>`).join("")}</div>
        <div class="timer"><i></i></div><span class="dim">If you don't answer, the team lead decides (${esc(def.options[def.fallback])}).</span></div>`;
    }
    box.querySelector<HTMLElement>(".timer i")!.style.width = `${pct}%`;
  }

  function appendLog(exp: Expedition): void {
    const box = side.querySelector<HTMLElement>(".radio");
    if (!box) return;
    // One squelch per batch of new lines, so reopening a long log is not a racket.
    if (logCount < exp.log.length && logCount > 0) sfx("squelch");
    for (; logCount < exp.log.length; logCount++) {
      const p = document.createElement("p");
      p.textContent = exp.log[logCount];
      box.appendChild(p);
    }
    box.scrollTop = box.scrollHeight;
  }

  function draw(): void {
    const s = game();
    const exp = current();
    const levelId = shownLevel();
    const lv = levelOf(s, levelId);
    const fog = s.fog[levelId];
    const taken = s.takenToday[levelId];
    const w = (canvas.width = Math.max(100, canvas.clientWidth * devicePixelRatio));
    const h = (canvas.height = Math.max(100, canvas.clientHeight * devicePixelRatio));
    const ctx = canvas.getContext("2d")!;
    const cell = cellSize(canvas, lv);
    const ox = Math.floor((w - cell * lv.w) / 2);
    const oy = Math.floor((h - cell * lv.h) / 2);
    ctx.fillStyle = "#0e1208";
    ctx.fillRect(0, 0, w, h);

    for (let y = 0; y < lv.h; y++)
      for (let x = 0; x < lv.w; x++) {
        const i = y * lv.w + x;
        const px = ox + x * cell;
        const py = oy + y * cell;
        if (!fog[i]) {
          // Unexplored: a faint grid so the map reads as a map, not a black box.
          ctx.fillStyle = "#1b2110";
          ctx.fillRect(px, py, cell - 1, cell - 1);
          continue;
        }
        const c = lv.cells[i];
        ctx.fillStyle = c === FLOOR ? "#b9a94f" : c === DARK ? "#4d4622" : "#24210f";
        ctx.fillRect(px, py, cell - 1, cell - 1);
      }

    // Loot the crews have seen and not picked up yet.
    lv.loot.forEach((l, i) => {
      if (!fog[idx(lv, l.at)] || taken.includes(i)) return;
      ctx.fillStyle = "#e8d46a";
      ctx.strokeStyle = "#1d1a0e";
      const px = ox + l.at.x * cell + cell * 0.25;
      const py = oy + l.at.y * cell + cell * 0.25;
      ctx.fillRect(px, py, cell * 0.5, cell * 0.5);
      ctx.strokeRect(px, py, cell * 0.5, cell * 0.5);
    });

    // Entrance.
    ctx.fillStyle = "#6fa04a";
    ctx.fillRect(ox + lv.entrance.x * cell, oy + lv.entrance.y * cell, cell - 1, cell - 1);
    ctx.fillStyle = "#e9e2b0";
    ctx.font = `bold ${Math.max(9, cell * 0.45)}px monospace`;
    ctx.fillText("IN", ox + lv.entrance.x * cell + 1, oy + lv.entrance.y * cell + cell * 0.7);

    const mk = exp && exp.phase !== "done" ? exp.waypoint : !exp ? marker : null;
    if (mk) cross(ctx, ox + mk.x * cell + cell / 2, oy + mk.y * cell + cell / 2, cell * 0.38);

    // Every crew in the field shows; the one you're listening to pulses red.
    for (const other of running(s)) {
      if (other === exp || other.levelId !== levelId) continue;
      ctx.fillStyle = "#d98a2b";
      ctx.beginPath();
      ctx.arc(ox + other.pos.x * cell + cell / 2, oy + other.pos.y * cell + cell / 2, cell * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }

    if (exp && exp.phase !== "done") {
      for (const r of exp.entities) {
        if (!r.seen) continue;
        const x = ox + r.pos.x * cell + cell / 2;
        const y = oy + r.pos.y * cell + cell / 2;
        if (r.id === "smiler") smiler(ctx, x, y, cell * 0.42);
        else if (r.id === "hound") hound(ctx, x, y, cell * 0.42);
        else if (r.id === "faceling") faceling(ctx, x, y, cell * 0.42);
        else sprite(ctx, entityDef(r.id).art, x, y, cell * 1.3, draw);
      }
      const pulse = 0.6 + 0.4 * Math.sin(performance.now() / 160);
      ctx.fillStyle = `rgba(214,58,36,${pulse})`;
      ctx.beginPath();
      ctx.arc(ox + exp.pos.x * cell + cell / 2, oy + exp.pos.y * cell + cell / 2, cell * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#f3ecc0";
      ctx.lineWidth = Math.max(1, cell / 10);
      ctx.stroke();
    }

    const pct = Math.round(100 * surveyed(s, lv, levelId));
    if (!exp && pct < 15) {
      ctx.fillStyle = "rgba(233,226,176,0.75)";
      ctx.font = `${12 * devicePixelRatio}px monospace`;
      ctx.textAlign = "center";
      ctx.fillText("Unexplored. Click the map to drop a marker, then send a crew.", w / 2, h - 14 * devicePixelRatio);
      ctx.textAlign = "start";
    }
    ctx.fillStyle = "#e9e2b0";
    ctx.font = `bold ${11 * devicePixelRatio}px monospace`;
    ctx.fillText(`LEVEL ${levelDef(levelId).depth} · SURVEYED ${pct}%`, 8 * devicePixelRatio, 16 * devicePixelRatio);
  }

  watch(
    body,
    (topic: Topic) => {
      const exp = current();
      // Ticks only append radio lines, unless a run just finished, a call came
      // in, or the tab labels changed.
      const shownTabs = side.querySelector(".runtabs")?.textContent ?? "";
      const wantTabs = (() => {
        const d = document.createElement("div");
        d.innerHTML = tabs();
        return d.textContent ?? "";
      })();
      const finished = exp?.phase === "done" && !side.querySelector(".debrief");
      if (topic === "tick" && exp && side.querySelector(".radio") && !finished && shownTabs === wantTabs) {
        appendLog(exp);
        renderCall(exp);
      } else if (topic === "tick" && !exp && shownTabs === wantTabs) {
        // Planning: leave the form alone so checkboxes don't reset.
      } else renderSide();
      draw();
    },
    ["all", "tick"],
  );
  new ResizeObserver(() => draw()).observe(canvas);
}

function cellSize(canvas: HTMLCanvasElement, lv: { w: number; h: number }): number {
  return Math.max(4, Math.floor(Math.min(canvas.width / lv.w, canvas.height / lv.h)));
}

function cross(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.strokeStyle = "#d63a24";
  ctx.lineWidth = Math.max(2, r / 3);
  ctx.beginPath();
  ctx.moveTo(x - r, y - r);
  ctx.lineTo(x + r, y + r);
  ctx.moveTo(x + r, y - r);
  ctx.lineTo(x - r, y + r);
  ctx.stroke();
}

function smiler(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(x, y, r * 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#f6f2dc";
  ctx.fillRect(x - r * 0.6, y - r * 0.5, r * 0.3, r * 0.3);
  ctx.fillRect(x + r * 0.3, y - r * 0.5, r * 0.3, r * 0.3);
  ctx.strokeStyle = "#f6f2dc";
  ctx.lineWidth = Math.max(1, r / 4);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.75, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
}

function hound(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  // A low red wedge pointing forward: something on all fours.
  ctx.fillStyle = "#7a1d12";
  ctx.strokeStyle = "#f3ecc0";
  ctx.lineWidth = Math.max(1, r / 5);
  ctx.beginPath();
  ctx.moveTo(x - r * 1.2, y + r * 0.7);
  ctx.lineTo(x + r * 1.2, y + r * 0.7);
  ctx.lineTo(x, y - r * 1.1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#ffd23a";
  ctx.fillRect(x - r * 0.35, y - r * 0.05, r * 0.22, r * 0.22);
  ctx.fillRect(x + r * 0.13, y - r * 0.05, r * 0.22, r * 0.22);
}

function faceling(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  // A blank oval head: no features at all.
  ctx.fillStyle = "#d8c7a8";
  ctx.strokeStyle = "#1d1a0e";
  ctx.lineWidth = Math.max(1, r / 5);
  ctx.beginPath();
  ctx.ellipse(x, y, r * 0.8, r * 1.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

// Other entities show as a small framed picture of their Index art.
const sprites = new Map<string, HTMLImageElement>();
function sprite(ctx: CanvasRenderingContext2D, file: string, x: number, y: number, size: number, redraw: () => void): void {
  let img = sprites.get(file);
  if (!img) {
    img = new Image();
    img.onload = redraw;
    img.src = `./art/entities/${file}`;
    sprites.set(file, img);
  }
  ctx.fillStyle = "#000";
  ctx.fillRect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
  if (img.complete && img.naturalWidth) ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  ctx.strokeStyle = "#d63a24";
  ctx.lineWidth = Math.max(1, size / 14);
  ctx.strokeRect(x - size / 2, y - size / 2, size, size);
}
