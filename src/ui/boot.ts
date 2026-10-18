// Boot screen: a BIOS-style POST, then onboarding paperwork for a new boss
// (name, catchphrase, company name) or a "clock in" button for a returning one.
// The button press is also the click browsers need before they allow sound.
import { companyName, type GameState } from "../sim/state";
import { shownName } from "../privacy";
import { sfx, startAudio } from "./audio";

const CATCHPHRASES = ["Results, not excuses.", "Everyone is replaceable.", "Smile. It's a workplace.", "Not my department."];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function boot(root: HTMLElement, state: GameState, fast = false): Promise<void> {
  const screen = document.createElement("div");
  screen.className = "boot";
  screen.innerHTML = `<pre class="post"></pre><div class="boot-card" hidden></div>`;
  root.appendChild(screen);
  const post = screen.querySelector("pre")!;

  const lines: [string, string, number][] = [
    ["PARTITION SYSTEMS BIOS v4.01  (C) 1994", "", 200],
    ["Memory test ..................... ", "640K OK", 350],
    ["Fluorescent ballast ............. ", "OK (hum)", 300],
    ["Carpet .......................... ", "DAMP", 300],
    ["Employees detected .............. ", state.catchphrase ? "1" : "0", 300],
    ["Exits detected .................. ", "0", 900],
    ["", "", 100],
    [`Loading WORKSTATION.SYS for ${state.company}`, "", 400],
  ];
  for (const [label, result, pause] of lines) {
    post.textContent += label;
    if (!fast) await sleep(pause);
    post.textContent += result + "\n";
  }
  if (!fast) await sleep(500);

  const card = screen.querySelector<HTMLElement>(".boot-card")!;
  card.hidden = false;
  await (state.catchphrase ? clockIn(card, state) : onboarding(card, state));
  startAudio();
  sfx("open");
  screen.classList.add("gone");
  await sleep(fast ? 0 : 700);
  screen.remove();
}

function clockIn(card: HTMLElement, state: GameState): Promise<void> {
  card.innerHTML = `
    <div class="win active static">
      <div class="tb"><span>TIMECLOCK.EXE</span></div>
      <div class="body">
        <p class="welcome"></p>
        <p class="dim catch"></p>
        <button class="btn big go" data-clockin>CLOCK IN</button>
      </div>
    </div>`;
  card.querySelector(".welcome")!.textContent =
    state.infection >= 60 ? `Welcome back, ${shownName(state.bossName)}. You never left.` : `Welcome back, ${shownName(state.bossName)}.`;
  card.querySelector(".catch")!.textContent = `"${state.catchphrase}"`;
  const btn = card.querySelector<HTMLButtonElement>("[data-clockin]")!;
  btn.focus();
  return new Promise((resolve) => btn.addEventListener("click", () => resolve(), { once: true }));
}

function onboarding(card: HTMLElement, state: GameState): Promise<void> {
  card.innerHTML = `
    <div class="win active static onboard">
      <div class="tb"><span>EMPLOYEE ONBOARDING - FORM 1 OF 1 OF 2</span></div>
      <div class="body">
        <h2>Welcome, new Regional Overseer.</h2>
        <label class="lbl" for="ob-name">Your name</label>
        <input class="field" id="ob-name" maxlength="24" autocomplete="off" placeholder="Print clearly">
        <label class="lbl" for="ob-catch">Your catchphrase</label>
        <input class="field" id="ob-catch" maxlength="48" autocomplete="off">
        <div class="chips"></div>
        <label class="lbl">Company name (generated)</label>
        <div class="row"><div class="field company"></div><button class="btn" data-reroll>REROLL</button></div>
        <p class="fine">By signing you agree that the Company may call you by name, know what time it is
        where you are, and occasionally guess the rest. Nothing leaves this computer.</p>
        <button class="btn big go" data-sign disabled>SIGN AND CLOCK IN</button>
      </div>
    </div>`;

  const name = card.querySelector<HTMLInputElement>("#ob-name")!;
  const phrase = card.querySelector<HTMLInputElement>("#ob-catch")!;
  const sign = card.querySelector<HTMLButtonElement>("[data-sign]")!;
  const company = card.querySelector<HTMLElement>(".company")!;
  phrase.placeholder = CATCHPHRASES[0];
  company.textContent = state.company;

  const chips = card.querySelector(".chips")!;
  for (const c of CATCHPHRASES) {
    const b = document.createElement("button");
    b.className = "chip";
    b.type = "button";
    b.textContent = c;
    b.addEventListener("click", () => {
      phrase.value = c;
      update();
    });
    chips.appendChild(b);
  }

  card.querySelector("[data-reroll]")!.addEventListener("click", () => {
    state.seed = (state.seed * 1103515245 + 12345) >>> 0;
    state.company = companyName(state.seed);
    company.textContent = state.company;
  });

  const update = () => (sign.disabled = name.value.trim().length === 0);
  // Typewriter clicks once sound is allowed; before the first click they are silent.
  for (const input of [name, phrase]) {
    input.addEventListener("input", update);
    input.addEventListener("keydown", () => sfx("type"));
  }
  name.focus();

  return new Promise((resolve) => {
    sign.addEventListener("click", () => {
      state.bossName = name.value.trim().slice(0, 24);
      state.catchphrase = (phrase.value.trim() || CATCHPHRASES[0]).slice(0, 48);
      resolve();
    });
  });
}
