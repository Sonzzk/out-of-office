// Play-test for the late game: infection stage looks (2, 3, 4), the stuck clock and the
// stage-four "wrong" event, calm mode switching them off, the tray label following the
// Handbook, the farmhouse arrival sequence, the end screen with crew and locked slots,
// and the plaques on the desk. Screenshots: shots/lategame-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

const PORT = 5323;
mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: PORT }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const { endDay } = await server.ssrLoadModule("/src/sim/economy.ts");

function company(seed, infection, extra = {}) {
  const s = newGame(seed, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = 4;
  for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
  s.cash = 6000;
  endDay(s);
  s.infection = infection;
  s.infectionSeen = 4;
  Object.assign(s, extra);
  return s;
}

async function open(save, name, calm = false, fast = true) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.addInitScript(([r, c]) => {
    if (!sessionStorage.seeded) {
      sessionStorage.seeded = "1";
      localStorage.setItem("out-of-office.save", r);
      localStorage.setItem("out-of-office.calm", c ? "1" : "0");
      localStorage.setItem("out-of-office.asked-recording", "1"); // no recording prompt over the screenshots
    }
  }, [JSON.stringify(save), calm]);
  await page.goto(`http://localhost:${PORT}/${fast ? "?fast" : ""}`);
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  return page;
}

// 1. The look by stage, and the clock.
for (const [stage, inf] of [[2, 45], [3, 65], [4, 90]]) {
  const page = await open(company(31, inf, { act: 2, storyFlags: { shownAct: 2 } }), `stage${stage}`);
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => document.querySelector("#desk").className);
  if (!cls.includes(`inf-${stage}`)) fail(`stage ${stage}: desk class is "${cls}"`);
  const clock = await page.textContent("[data-clock]");
  if ((stage >= 3) !== (clock === "3:00 AM")) fail(`stage ${stage}: clock reads ${clock}`);
  await page.screenshot({ path: `shots/lategame-stage${stage}.png` });
  if (stage === 4) {
    // The wrong event: the office as the wall, or a window typing by itself.
    const seen = await page.waitForSelector(".wrong-wall, .wrong-win", { timeout: 60_000 }).then(() => true, () => false);
    if (!seen) fail("no wrong event at stage 4 within 60 s");
    else {
      await page.waitForTimeout(900);
      await page.screenshot({ path: "shots/lategame-wrong.png" });
      await page.waitForSelector(".wrong-wall, .wrong-win", { state: "detached", timeout: 6000 }).catch(() => fail("wrong event stayed on screen"));
    }
  }
  await page.close();
}

// 2. Calm mode: no looks, no stuck clock, and the tray label follows the Handbook.
{
  const page = await open(company(31, 90, { act: 2, storyFlags: { shownAct: 2 } }), "calm", true);
  await page.waitForTimeout(1500);
  const cls = await page.evaluate(() => document.querySelector("#desk").className);
  if (/inf-\d/.test(cls)) fail(`calm desk still has a stage look: ${cls}`);
  if ((await page.textContent("[data-clock]")) === "3:00 AM") fail("calm clock stuck");
  if ((await page.textContent("[data-calm]")) !== "calm: on") fail("tray should read calm: on");
  await page.evaluate(async () => { const a = await import("/src/ui/audio.ts"); a.setCalm(false); });
  await page.waitForTimeout(300);
  if ((await page.textContent("[data-calm]")) !== "calm: off") fail("tray did not follow setCalm(false)");
  await page.waitForTimeout(1500);
  const cls2 = await page.evaluate(() => document.querySelector("#desk").className);
  if (!cls2.includes("inf-4")) fail("stage look did not return when calm went off");
  await page.close();
}

// 3. The arrival, the end screen, the plaques. The save is staged just as the sim leaves it.
{
  const s = company(31, 20, { act: 3, storyFlags: { shownAct: 3 } });
  const names = s.crew.map((w) => w.name);
  s.crew[2].status = "dead";
  s.ending = "daylight";
  s.endings = ["daylight"];
  s.endingCrew = { present: names.slice(0, 2), missing: [names[2]] };
  const page = await open(s, "arrival", false, false); // real speed, to watch it
  await page.waitForSelector(".arrival");
  await page.waitForTimeout(600);
  await page.screenshot({ path: "shots/lategame-arrival-1.png" });
  await page.waitForFunction(() => document.querySelector(".arrival")?.dataset.phase === "2");
  await page.waitForTimeout(500);
  await page.screenshot({ path: "shots/lategame-arrival-2.png" });
  await page.waitForFunction(() => document.querySelector(".arrival")?.dataset.phase === "3");
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "shots/lategame-arrival-3.png" });
  await page.waitForSelector(".ending .sheet", { timeout: 12000 });
  const text = await page.textContent(".ending");
  if (!text.includes(names[2]) || !text.includes("missing")) fail("end screen does not show who is missing");
  if (!text.includes("Severance")) fail("end screen does not name the ending");
  if ((await page.locator(".ending .endlist .locked").count()) !== 7) fail("end screen should have 7 locked slots");
  await page.waitForTimeout(1500); // the page fades in
  await page.screenshot({ path: "shots/lategame-end.png" });
  await page.click("[data-quarter]");
  await page.waitForSelector(".plaques");
  await page.screenshot({ path: "shots/lategame-plaques.png" });
  await page.click(".plaques");
  await page.waitForSelector(".win .endlist");
  await page.close();
}

// 4. Resigning has no arrival: straight to the page.
{
  const s = company(31, 20, { act: 2, storyFlags: { shownAct: 2 }, ending: "resigned", endings: ["resigned"] });
  const page = await open(s, "resigned");
  await page.waitForSelector(".ending .sheet", { timeout: 3000 });
  if (await page.locator(".arrival").count()) fail("resigning played the arrival");
  await page.close();
}

await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("lategame ok");
