// Play-test for the body cam's per-level looks, wall decals, teammates ahead and
// calmer danger cues. Stages a run on several levels and saves the feed to shots/bodycam2-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5301 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const { learn } = await server.ssrLoadModule("/src/sim/research.ts");
const x = await server.ssrLoadModule("/src/sim/expedition.ts");

function stage(levelId, steps, danger) {
  const s = newGame(41, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = 4;
  s.cash = 20000;
  for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
  learn(s, levelId, 1);
  const exp = x.startExpedition(s, s.crew.map((w) => w.id), [{ x: 24, y: 10 }], undefined, levelId);
  exp.callsMade = 99;
  exp.entities = [];
  for (let k = 0; k < steps; k++) x.stepExpedition(s, exp);
  if (danger) exp.entities = [{ id: "hound", pos: { x: exp.pos.x + 3, y: exp.pos.y }, cooldown: 99999, seen: false }];
  return JSON.stringify(s);
}

async function shoot(levelId, steps, tag, danger = false) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  page.on("pageerror", (e) => errors.push("page " + e.message));
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, stage(levelId, steps, danger));
  await page.goto("http://localhost:5301/");
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  await page.click('[data-open="map"]');
  const cam = page.locator(".win[data-app='map'] canvas.bodycam");
  await cam.waitFor();
  const looks = [];
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(1500);
    await cam.screenshot({ path: `shots/bodycam2-${tag}-${i}.png` });
    looks.push(await cam.evaluate((c) => c.toDataURL()));
  }
  if (new Set(looks).size < 2) fail(`${tag}: feed is not animating`);
  const colours = await cam.evaluate((c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 16) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4));
    return seen.size;
  });
  if (colours < 60) fail(`${tag}: feed looks flat (${colours} colours)`);
  await page.close();
}

for (const [lv, steps] of [["level-0", 14], ["level-2", 20], ["level-4", 12], ["level-7", 12], ["level-1", 12], ["level-3", 12], ["level-5", 12], ["level-8", 20], ["level-9", 12], ["level-10", 12]]) {
  await shoot(lv, steps, lv.replace("level-", "L"));
}
await shoot("level-0", 14, "L0danger", true);
await browser.close();
await server.close();
if (errors.length) { console.error("FAIL\n" + errors.join("\n")); process.exit(1); }
console.log("bodycam2 ok");
