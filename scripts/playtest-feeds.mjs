// Play-test for the Feeds Wall: a live tile per crew, a flashing tile when a
// crew is waiting, answering from an enlarged feed, and the last-run replay.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5221 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const x = await server.ssrLoadModule("/src/sim/expedition.ts");
function stage(withRuns) {
  const s = newGame(41, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = 4;
  s.cash = 20000;
  s.upgrades.dispatch = 2;
  for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
  const runs = [];
  if (withRuns) {
    for (const [i, c] of s.crew.entries()) {
      const exp = x.startExpedition(s, [c.id], [{ x: 20 + i * 2, y: 5 + i * 3 }]);
      exp.callsMade = 99;
      exp.entities = [];
      for (let k = 0; k < 10; k++) x.stepExpedition(s, exp);
      runs.push(exp);
    }
    runs[1].call = { id: "door", asked: runs[1].tick, m: runs[1].crewIds[0] };
  } else {
    const exp = x.startExpedition(s, s.crew.map((w) => w.id), [{ x: 25, y: 5 }]);
    exp.entities = [];
    for (let k = 0; k < 3000 && exp.phase !== "done"; k++) { exp.callsMade = 99; x.stepExpedition(s, exp); }
  }
  return JSON.stringify(s);
}

async function open(save) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  page.on("pageerror", (e) => errors.push("page " + e.message));
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
  await page.goto("http://localhost:5221/");
  await page.waitForSelector("[data-clockin], #desk .win");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .win");
  return page;
}

// Two crews out, one waiting on a call.
{
  const page = await open(stage(true));
  await page.click('[data-open="feeds"]');
  const feeds = page.locator('.win[data-app="feeds"]');
  await page.waitForTimeout(600);
  const tiles = await feeds.locator(".tile[data-run]").count();
  console.log("tiles:", tiles);
  if (tiles !== 3) fail(`expected 3 tiles, saw ${tiles}`);
  if ((await feeds.locator(".tile.alert").count()) !== 1) fail("expected one flashing tile");
  await page.screenshot({ path: "shots/feeds-1-wall.png" });
  await feeds.locator(".tile.alert").click();
  await page.waitForTimeout(300);
  if (!(await feeds.locator(".detail [data-answer]").count())) fail("enlarged feed shows no answer buttons");
  await page.screenshot({ path: "shots/feeds-2-focus.png" });
  await feeds.locator('.detail [data-answer="1"]').click();
  await page.waitForTimeout(400);
  if (await feeds.locator(".tile.alert").count()) fail("tile still flashing after the answer");
  await feeds.locator("[data-wall]").click();
  if ((await feeds.locator(".tile[data-run]").count()) !== 3) fail("back to the wall lost tiles");
  await page.close();
}

// Nobody out, a finished run to replay.
{
  const page = await open(stage(false));
  await page.click('[data-open="feeds"]');
  const feeds = page.locator('.win[data-app="feeds"]');
  await page.waitForTimeout(400);
  if (!(await feeds.locator(".nofeed").count())) fail("no empty state");
  await page.screenshot({ path: "shots/feeds-3-empty.png" });
  await feeds.locator("[data-replay]").click();
  await page.waitForTimeout(1500);
  if (!(await feeds.locator(".tile.replay canvas").count())) fail("replay did not start");
  await page.screenshot({ path: "shots/feeds-4-replay.png" });
  await feeds.locator("[data-stop]").click();
  if (!(await feeds.locator(".nofeed").count())) fail("stop did not return to the empty state");
  await page.close();
}

await browser.close();
await server.close();
if (errors.length) { console.log("ERRORS\n" + errors.join("\n")); process.exit(1); }
console.log("feeds ok");
