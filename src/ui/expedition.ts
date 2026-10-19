import { ITEMS } from "../data/items";
import { isVeteran } from "../sim/crew";
import { CALLS, THREAT_OPTIONS, THREAT_TICKS } from "../data/calls";
import { scrub } from "../privacy";
import { radioStatic, sfx } from "./audio";
import { entityDef } from "../data/entities";
import { GEAR, gearDef } from "../data/gear";
import { LEVELS, levelDef } from "../data/levels";
import { indexEntry } from "../data/index";
import { sellPrice, wage } from "../sim/economy";
import { crewSlots } from "../sim/facilities";
import { surveyed, isUnlocked } from "../sim/research";
import { answerCall, answerThreat, callTicks, canDistract, canGiveSomeone, levelOf, orderExpedition, orderReady, type Order, MAX_CREW, MAX_PINS, oddsWord, running, startExpedition, suggestLead, type Expedition } from "../sim/expedition";
import { infectionStage } from "../sim/infection";
import { DARK, FLOOR, idx, type Pt } from "../sim/level";
import { makeRng } from "../sim/rng";
import type { GameState } from "../sim/state";
import { game, update, watch, type Topic } from "../store";
import { art, esc } from "./dom";
import { attachClip } from "./clip";
import { access, tapWord } from "../access";
import { createBodycam, type Bodycam, type CamInput } from "./bodycam";

const TAP = tapWord(); // "Tap" on a touch screen, "Click" with a mouse

// What the run was worth once the crew and the kit are paid for.
function profitLine(exp: Expedition): string {
  const s = game();
  const loot = exp.result!.loot.reduce((a, id) => a + sellPrice(id, s), 0);
  const gear = exp.gear.reduce((a, id) => a + gearDef(id).cost, 0);
  const wages = exp.crewIds.map((id) => s.crew.find((w) => w.id === id)).filter((w) => w && w.status !== "dead").reduce((a, w) => a + wage(w!), 0);
  const net = loot - gear - wages;
  const part = (label: string, n: number) => `${label} ${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString("en-US")}`;
  return `<div class="profit ${net < 0 ? "neg" : "pos"}"><b>Run profit: ${net < 0 ? "-" : "+"}$${Math.abs(net).toLocaleString("en-US")}</b> <span class="dim">(${part("loot", loot)}, ${part("a day's wages", -wages)}${gear ? `, ${part("gear", -gear)}` : ""})</span></div>`;
}

// Facility Map: plan a run by picking a level, a crew and a marker,
// then watch it play out on the same schematic with the radio log beside it.
export function renderExpedition(body: HTMLElement): void {
  body.classList.add("expo");
  body.innerHTML = `
    <div class="mapwrap"><canvas class="map"></canvas></div>
    <div class="side"></div>`;
  const canvas = body.querySelector("canvas")!;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", "Facility map of the selected level. Use the arrow keys to move a cursor and Enter to drop or lift a pin. The radio log beside it describes what the crew finds.");
  const side = body.querySelector<HTMLElement>(".side")!;
  let pins: Pt[] = []; // route for the next run, visited in order
  let cursor: Pt | null = null; // keyboard cursor on the map, for placing pins without a mouse
  const mapSay = document.createElement("div"); // read out by screen readers when the cursor moves
  mapSay.className = "sr";
  mapSay.setAttribute("aria-live", "polite");
  body.appendChild(mapSay);
  const picked = new Set<number>();
  let leadId: number | null = null;
  const dismissed = new Set<number>(); // finished runs whose debrief was closed
  let selected: number | null = null; // the run shown in the side panel
  let planning = false; // planning a second run while one is out
  let planLevel = "level-0";
  const packed = new Set<string>(); // gear for the next run
  let cam: Bodycam | null = null;
  let stopClip = () => {};

  // What the body camera needs to know about a run right now.
  function camInput(exp: Expedition): CamInput {
    const st = game();
    const lead = st.crew.find((w) => w.id === exp.leadId) ?? st.crew.find((w) => exp.crewIds.includes(w.id));
    return {
      lv: levelOf(st, exp.levelId),
      exp,
      operator: lead?.name ?? "Crew",
      day: st.day,
      infection: st.infection,
      taken: st.takenToday[exp.levelId] ?? [],
      levelName: levelDef(exp.levelId).name,
      depth: levelDef(exp.levelId).depth,
      mates: exp.crewIds.filter((id) => id !== lead?.id).map((id) => st.crew.find((w) => w.id === id)).filter((w) => w?.status === "out").map((w) => w!.portrait),
    };
  }

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
    if (x >= 0 && y >= 0 && x < lv.w && y < lv.h) togglePin(x, y);
  });

  function togglePin(x: number, y: number): void {
    const at = pins.findIndex((p) => p.x === x && p.y === y);
    if (at >= 0) pins.splice(at, 1); // click a pin again to lift it
    else if (pins.length < MAX_PINS) pins.push({ x, y });
    draw();
    renderSide();
  }

  // Keyboard route planning: Tab to the map, arrows move a cursor, Enter drops or lifts a pin.
  canvas.tabIndex = 0;
  canvas.addEventListener("focus", () => draw());
  canvas.addEventListener("blur", () => draw());
  canvas.addEventListener("keydown", (ev) => {
    if (current() || !canPlan()) return;
    const lv = levelOf(game(), planLevel);
    const step: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (step[ev.key]) {
      ev.preventDefault();
      const c = (cursor ??= { x: Math.floor(lv.w / 2), y: Math.floor(lv.h / 2) });
      cursor = { x: Math.max(0, Math.min(lv.w - 1, c.x + step[ev.key][0])), y: Math.max(0, Math.min(lv.h - 1, c.y + step[ev.key][1])) };
      mapSay.textContent = `Cursor at column ${cursor.x + 1}, row ${cursor.y + 1}. ${pins.some((p) => p.x === cursor!.x && p.y === cursor!.y) ? "A pin is here." : ""}`;
      draw();
    } else if ((ev.key === "Enter" || ev.key === " ") && cursor) {
      ev.preventDefault();
      togglePin(cursor.x, cursor.y);
      mapSay.textContent = `${pins.length} of ${MAX_PINS} pins.`;
    }
  });

  body.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement;
    const pickLevel = t.closest<HTMLElement>("[data-level]");
    if (pickLevel) {
      if (pickLevel.dataset.level !== planLevel) pins = [];
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
    const threat = t.closest<HTMLElement>("[data-threat]");
    if (threat) {
      const exp = current();
      if (exp) update((s) => void answerThreat(s, exp, Number(threat.dataset.threat)));
      return;
    }
    const order = t.closest<HTMLElement>("[data-order]");
    if (order) {
      const exp = current();
      if (exp) update((s) => void orderExpedition(s, exp, order.dataset.order as Order));
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
    if (t.closest("[data-clearpins]")) {
      pins = [];
      renderSide();
      draw();
      return;
    }
    if (t.closest("[data-send]") && pins.length) {
      const m = pins;
      const lead = leadId ?? undefined;
      update((s) => {
        const exp = startExpedition(s, [...picked], m, lead, planLevel, [...packed]);
        if (exp) selected = exp.id;
      });
      planning = false;
      picked.clear();
      packed.clear();
      leadId = null;
      pins = [];
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
      // The lead may have left the payroll since (a sold contract), so fall back gracefully.
      const lead = s.crew.find((w) => w.id === e.leadId) ?? s.crew.find((w) => e.crewIds.includes(w.id));
      const state = e.call ? `<b class="ring">CALL</b>` : e.phase === "done" ? "back" : "out";
      return `L${levelDef(e.levelId).depth} ${esc(lead?.name.split(" ")[0] ?? "Crew")}${e.crewIds.length > 1 ? ` +${e.crewIds.length - 1}` : ""} · ${state}`;
    };
    return `<div class="runtabs">${runs
      .map((e) => `<button class="tab ${exp?.id === e.id ? "on" : ""}" data-run="${e.id}">${label(e)}</button>`)
      .join("")}${canPlan() ? `<button class="tab ${!exp ? "on" : ""}" data-run="plan">+ New run</button>` : ""}</div>`;
  }

  function renderSide(): void {
    const s = game();
    const exp = current();
    body.classList.toggle("watching", !!exp);
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
          : s.crew.some((w) => w.status !== "dead")
            ? `<p class="dim">Everyone is busy right now. They are back once you close the books.</p>`
            : `<p class="dim">Nobody available. Hire someone in HR Roster.</p>`
      }
      ${busyList(s)}
      ${picked.size ? `<p class="dim">Up to ${MAX_CREW}. ${access().relaxed === "wait" ? "The crew waits for you on calls." : "The team lead decides when to turn back."}</p>` : ""}
      <h4>2. Drop pins</h4>
      <p class="dim">${pins.length ? `${pins.length} of ${MAX_PINS} pins. The crew visits them in order, then heads home. ${TAP} a pin to lift it.` : `${TAP} the map to drop up to ${MAX_PINS} pins. Dark areas are unexplored.`}
      ${pins.length ? `<button class="btn" data-clearpins>Clear pins</button>` : ""}</p>
      <h4>3. Pack gear <span class="dim">(optional, used up)</span></h4>
      <div class="gear">${GEAR.map((g) => {
        const spent = [...packed].filter((id) => id !== g.id).reduce((a, id) => a + gearDef(id).cost, 0);
        const can = packed.has(g.id) || s.cash - spent >= g.cost;
        return `<label title="${esc(g.blurb)}"><input type="checkbox" data-gear="${g.id}" ${packed.has(g.id) ? "checked" : ""} ${can ? "" : "disabled"}>
          <img src="${art.item(g.art)}" alt="">${esc(g.name)} <span class="dim">$${g.cost}</span></label>`;
      }).join("")}</div>
      <div class="odds">Survival odds: <b>${picked.size ? oddsWord(s, [...picked]) : "..."}</b></div>
      <button class="btn go big" data-send ${picked.size && pins.length ? "" : "disabled"}>Send them in</button>`;
  }

  let logCount = 0;
  function renderRun(exp: Expedition): void {
    const s = game();
    const crew = exp.crewIds.map((id) => s.crew.find((w) => w.id === id)).filter((w): w is NonNullable<typeof w> => !!w);
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
          ${exp.result!.notes.map((n) => `<br>${esc(n)}`).join("")}
          ${profitLine(exp)}</div>
          <button class="btn go" data-dismiss>Plan the next run</button>`
        : "";
    side.innerHTML = `${tabs()}<canvas class="bodycam"></canvas><button class="btn clip" data-clip title="Save the recent feed as a WebM. The length is on the button.">Clip the feed</button><div class="callbox"></div><div class="orders"></div>${head}<div class="radio inset" aria-live="polite"></div>${debrief}`;
    logCount = 0;
    const camCanvas = side.querySelector<HTMLCanvasElement>("canvas.bodycam")!;
    cam = createBodycam(camCanvas, camInput(exp));
    stopClip();
    stopClip = attachClip(camCanvas, side.querySelector<HTMLButtonElement>("[data-clip]")!);
    appendLog(exp);
    renderCall(exp);
  }

  // A question from the crew, or a thing closing in, with the time left to answer.
  function renderCall(exp: Expedition): void {
    const box = side.querySelector<HTMLElement>(".callbox");
    if (!box) return;
    const key = exp.threat ? `threat:${exp.threat.id}:${exp.threat.asked}` : exp.call ? `call:${exp.call.id}:${exp.call.asked}` : "";
    if (!key) {
      if (box.dataset.key) radioStatic(false);
      box.dataset.key = "";
      box.innerHTML = "";
      renderOrders(exp);
      return;
    }
    if (box.dataset.key !== key) {
      box.dataset.key = key;
      radioStatic(true);
      if (exp.threat) {
        const s = game();
        const off = [false, false, !canDistract(exp), !canGiveSomeone(s, exp)];
        box.innerHTML = `<div class="call threat inset"><b>${esc(entityDef(exp.threat.id).name)} is close. Say something.</b>
          <div class="opts">${THREAT_OPTIONS.map((o, i) => `<button class="btn ${i === 0 ? "go" : ""}" data-threat="${i}" title="${esc(THREAT_TIPS[i])}" ${off[i] ? "disabled" : ""}>${esc(o)}</button>`).join("")}</div>
          <div class="timer"><i></i></div></div>`;
      } else {
        const def = CALLS.find((c) => c.id === exp.call!.id)!;
        box.innerHTML = `<div class="call inset"><b>The crew is waiting for your call</b>
          <div class="opts">${def.options.map((o, i) => `<button class="btn ${i === 0 ? "go" : ""}" data-answer="${i}">${esc(o)}</button>`).join("")}</div>
          <div class="timer"><i></i></div><span class="dim">If you don't answer, the team lead decides (${esc(def.options[def.fallback])}).</span></div>`;
      }
    }
    const total = exp.threat ? THREAT_TICKS : callTicks(exp);
    const left = Math.max(0, total - (exp.tick - (exp.threat ? exp.threat.asked : exp.call!.asked)));
    box.querySelector<HTMLElement>(".timer i")!.style.width = `${Math.round((100 * left) / total)}%`;
    renderOrders(exp);
  }

  // Standing orders: act any time between questions.
  const THREAT_TIPS = [
    "It will probably miss you, but the crew freezes for a few seconds.",
    "Depends on the crew's sense of direction. If it fails, it is worse.",
    "Costs the cheapest thing you carry. It leaves for a while.",
    "One of the crew is lost for good. It leaves. They will remember.",
  ];
  const ORDERS: { id: Order; label: string; tip: string }[] = [
    { id: "hold", label: "Hold", tip: "Freeze for a few seconds. Hard to notice, but not moving." },
    { id: "push", label: "Push on", tip: "Move twice as fast for a while. Louder." },
    { id: "back", label: "Turn back", tip: "Head home now with what you have." },
    { id: "distract", label: "Throw loot", tip: "Spend the cheapest thing carried to send the nearest threat away." },
  ];
  function renderOrders(exp: Expedition): void {
    const row = side.querySelector<HTMLElement>(".orders");
    if (!row) return;
    if (exp.phase === "done") {
      row.innerHTML = "";
      return;
    }
    if (!row.firstChild)
      row.innerHTML = `<span class="dim">Orders</span>${ORDERS.map((o) => `<button class="btn" data-order="${o.id}" title="${esc(o.tip)}">${o.label}</button>`).join("")}`;
    for (const b of Array.from(row.querySelectorAll<HTMLButtonElement>("[data-order]"))) {
      const id = b.dataset.order as Order;
      const wait = (exp.orderAt?.[id] ?? 0) - exp.tick;
      b.disabled = !orderReady(exp, id);
      b.classList.toggle("cool", wait > 0);
    }
  }

  function appendLog(exp: Expedition): void {
    const box = side.querySelector<HTMLElement>(".radio");
    if (!box) return;
    // One squelch per batch of new lines, so reopening a long log is not a racket.
    if (logCount < exp.log.length && logCount > 0) sfx("squelch");
    for (; logCount < exp.log.length; logCount++) {
      const p = document.createElement("p");
      p.textContent = scrub(exp.log[logCount], game().bossName);
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

    // Infected office: a few explored rooms show up a second time where nothing was explored.
    const stage = infectionStage(s);
    if (stage >= 3) {
      const rng = makeRng([...String(levelId)].reduce((a, c) => a * 31 + c.charCodeAt(0), 7) + s.day * 17);
      const seen: number[] = [];
      fog.forEach((f, i) => f && lv.cells[i] === FLOOR && seen.push(i));
      for (let n = 0; n < stage - 2 && seen.length; n++) {
        const at = seen[Math.floor(rng() * seen.length)];
        const sx = (at % lv.w) - 2;
        const sy = Math.floor(at / lv.w) - 2;
        const dx = Math.floor(rng() * Math.max(1, lv.w - 6));
        const dy = Math.floor(rng() * Math.max(1, lv.h - 5));
        for (let yy = 0; yy < 5; yy++)
          for (let xx = 0; xx < 6; xx++) {
            const fx = sx + xx;
            const fy = sy + yy;
            if (fx < 0 || fy < 0 || fx >= lv.w || fy >= lv.h) continue;
            const from = fy * lv.w + fx;
            const to = (dy + yy) * lv.w + dx + xx;
            if (!fog[from] || fog[to] || lv.cells[from] !== FLOOR) continue;
            ctx.fillStyle = "rgba(185,169,79,0.3)";
            ctx.fillRect(ox + (dx + xx) * cell, oy + (dy + yy) * cell, cell - 1, cell - 1);
          }
      }
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

    // Pins still to visit (a run in the field) or the route being planned.
    const route: Pt[] = exp
      ? exp.phase === "done" || exp.phase === "return"
        ? []
        : (exp.pins ?? [exp.waypoint]).filter((p) => exp.targets.some((t) => t.x === p.x && t.y === p.y))
      : pins;
    if (cursor && !exp && document.activeElement === canvas) {
      ctx.strokeStyle = "#f6f2dc";
      ctx.lineWidth = Math.max(2, cell / 8);
      ctx.strokeRect(ox + cursor.x * cell + 1, oy + cursor.y * cell + 1, cell - 2, cell - 2);
    }
    route.forEach((mk, i) => {
      const cx = ox + mk.x * cell + cell / 2;
      const cy = oy + mk.y * cell + cell / 2;
      cross(ctx, cx, cy, cell * 0.38);
      if (route.length > 1) {
        ctx.fillStyle = "#f6f2dc";
        ctx.font = `bold ${Math.max(9, cell * 0.5)}px monospace`;
        ctx.fillText(String(i + 1), cx + cell * 0.4, cy - cell * 0.25);
      }
    });

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
      // Two short lines when one would run off the edge of a narrow map.
      const line = `Unexplored. ${TAP} the map to drop pins, then send a crew.`;
      if (ctx.measureText(line).width < w - 16 * devicePixelRatio) ctx.fillText(line, w / 2, h - 14 * devicePixelRatio);
      else {
        ctx.fillText("Unexplored.", w / 2, h - 28 * devicePixelRatio);
        ctx.fillText(`${TAP} the map to drop pins.`, w / 2, h - 14 * devicePixelRatio);
      }
      ctx.textAlign = "start";
    }
    ctx.fillStyle = "#e9e2b0";
    ctx.font = `bold ${11 * devicePixelRatio}px monospace`;
    ctx.fillText(`LEVEL ${levelDef(levelId).depth} · SURVEYED ${pct}%`, 8 * devicePixelRatio, 16 * devicePixelRatio);
  }

  watch(
    body,
    (topic: Topic) => {
      try {
        paint(topic);
      } catch (err) {
        // Never leave the map window blank: say so, and offer the way out.
        console.error(err);
        side.innerHTML = `<p class="dim">The map could not be drawn for this run. Dismiss it to carry on.</p><button class="btn" data-dismiss>Dismiss run</button>`;
      }
    },
    ["all", "tick"],
  );

  function paint(topic: Topic): void {
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
      cam?.update(camInput(exp));
    } else if (topic === "tick" && !exp && shownTabs === wantTabs) {
      // Planning: leave the form alone so checkboxes don't reset.
    } else renderSide();
    draw();
  }
  new ResizeObserver(() => draw()).observe(canvas);
}

/** Crew who are not free, and why, so an empty picker is never a mystery. */
function busyList(s: GameState): string {
  const why = (w: GameState["crew"][number]) =>
    w.status === "out" ? "in the field" : w.assignment === "overtime" ? "in the Overtime Room until tomorrow" : "on a safe contract until tomorrow";
  const busy = s.crew.filter((w) => w.status === "out" || w.status === "busy");
  if (!busy.length) return "";
  return `<div class="dim busy">${busy.map((w) => `${esc(w.name)}: ${why(w)}`).join("<br>")}</div>`;
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
