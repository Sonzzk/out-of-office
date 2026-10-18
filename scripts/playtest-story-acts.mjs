// Play-test for the three-act story: the Act 3 title card, note and EXIT icon,
// sending the final crew, an ending end screen with stats, and the new quarter
// (no soft lock); plus resigning through Clock Out. Screenshots: shots/acts-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const PORT = 5304;
const server = await createServer({ server: { port: PORT }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const { endDay } = await server.ssrLoadModule("/src/sim/economy.ts");
const { learn } = await server.ssrLoadModule("/src/sim/research.ts");
const { INDEX } = await server.ssrLoadModule("/src/data/index.ts");
const story = await server.ssrLoadModule("/src/sim/story.ts");

// A company that has met every condition for the Exit, one night from Act 3.
function exitReady() {
  const s = newGame(41, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = 4;
  for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
  s.cash = 6000;
  for (const e of INDEX.slice(0, 4)) learn(s, e.id, 3);
  learn(s, "level-10", 1);
  s.target.year = 3;
  s.day = 19;
  s.act = 2;
  s.storyFlags = { shownAct: 2 };
  endDay(s);
  return s;
}

async function open(save, name) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, JSON.stringify(save));
  await page.goto(`http://localhost:${PORT}/?fast`);
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  return page;
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")));

// 1. Act 3 begins: title card, desktop note, EXIT icon, then the final crew goes.
{
  const s = exitReady();
  if (s.act !== 3) fail("staged save is not in Act 3");
  const page = await open(s, "act3");
  await page.waitForSelector(".act-card");
  await page.screenshot({ path: "shots/acts-1-card.png" });
  await page.click(".act-card");
  await page.waitForSelector(".act-card", { state: "detached" });
  if (!(await page.locator(".sticky-board").count())) fail("no desktop note in Act 3");
  if (!(await page.locator(".ic.exit").count())) fail("no EXIT icon in Act 3");
  if ((await saved(page)).storyFlags.shownAct !== 3) fail("title card would repeat");
  await page.click(".ic.exit");
  await page.waitForSelector(".win[data-app=exit]");
  await page.screenshot({ path: "shots/acts-2-exit.png" });
  await page.locator(".win[data-app=exit]").getByRole("button", { name: "Send the final crew" }).click();
  await page.locator(".dlg-btns").getByRole("button", { name: "Send them" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("out-of-office.save")).expeditions.some((e) => e.final));
  const exp = (await saved(page)).expeditions.find((e) => e.final);
  if (exp.levelId !== "level-10") fail("final descent is not on Level 10");
  await page.screenshot({ path: "shots/acts-3-descent.png" });
  await page.close();
}

// 2. The crew is home from the farmhouse: end screen, stats, new quarter.
{
  const s = exitReady();
  const exp = story.beginDescent(s);
  exp.phase = "done";
  exp.reached = true;
  exp.result = { survivors: exp.crewIds.length, dead: [], loot: [], notes: [] };
  for (const id of exp.crewIds) s.crew.find((w) => w.id === id).status = "idle";
  s.storyFlags.shownAct = 3;
  const page = await open(s, "ending");
  await page.waitForSelector(".ending");
  const id = await page.getAttribute(".ending", "data-ending");
  if (id !== "daylight") fail(`expected the daylight ending, got ${id}`);
  if ((await page.locator(".ending tr").count()) < 6) fail("end screen has no stats");
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "shots/acts-4-ending.png" });
  await page.click("[data-quarter]");
  await page.waitForSelector(".ending", { state: "detached" });
  const after = await saved(page);
  if (after.act !== 4 || after.ending) fail("new quarter did not start");
  if (!after.endings.includes("daylight")) fail("ending not recorded");
  await page.click(".ic[data-open=hr]");
  await page.waitForSelector(".win[data-app=hr]");
  await page.screenshot({ path: "shots/acts-5-quarter.png" });
  await page.close();
}

// 3. Resigning through Clock Out in Act 2.
{
  const s = newGame(43, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = 4;
  s.act = 2;
  s.storyFlags = { shownAct: 2 };
  const page = await open(s, "resign");
  await page.click(".start");
  await page.click(".startmenu >> text=Clock Out...");
  await page.locator(".dlg-btns").getByRole("button", { name: "Open the form" }).click();
  await page.waitForSelector(".win[data-app=exit]");
  await page.locator(".win[data-app=exit]").getByRole("button", { name: "Resign" }).click();
  await page.locator(".dlg-btns").getByRole("button", { name: "Sign" }).click();
  await page.waitForSelector(".ending[data-ending=resigned]");
  await page.waitForTimeout(1400);
  await page.screenshot({ path: "shots/acts-6-resigned.png" });
  await page.close();
}

await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("story acts ok");
