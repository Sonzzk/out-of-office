// Play-test for runs that ask for decisions: standing orders, several calls in
// a run, and the threat prompt. The threat is staged from a save so it is
// there when the page opens. Screenshots go to shots/story-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5220 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

// Stage a save with a run in progress and a hound two cells away.
const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const x = await server.ssrLoadModule("/src/sim/expedition.ts");
const lvl = await server.ssrLoadModule("/src/sim/level.ts");
const s = newGame(33, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 4;
for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
const exp = x.startExpedition(s, s.crew.map((w) => w.id), [{ x: 25, y: 5 }]);
exp.callsMade = 99;
exp.carried = ["almond-water"];
for (let i = 0; i < 6; i++) x.stepExpedition(s, exp);
const lv = x.levelOf(s, exp.levelId);
const cell = lvl.neighbors(lv, exp.pos).flatMap((p) => lvl.neighbors(lv, p)).find((p) => lvl.dist(p, exp.pos) === 2);
exp.entities = [{ id: "hound", pos: cell, cooldown: 0, seen: false }];
x.stepExpedition(s, exp);
if (!exp.threat) fail("staged threat did not open");
const save = JSON.stringify(s);

const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push("p1 " + e.stack.split("\n").slice(0,4).join(" | ")));
await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
await page.goto("http://localhost:5220/");
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
await map.locator(".call.threat").waitFor({ timeout: 4000 }).catch(() => fail("no threat prompt on the map"));
await page.screenshot({ path: "shots/story-1-threat.png" });
const opts = await map.locator("[data-threat]").count();
if (opts !== 4) fail(`expected 4 threat options, saw ${opts}`);
if (!(await map.locator("[data-order]").count())) fail("no orders row");
await map.locator('[data-threat="2"]').click(); // throw the water
await page.waitForTimeout(400);
if (await map.locator(".call.threat").count()) fail("threat prompt still showing after an answer");
const before = (await map.locator(".radio p").count());
await map.locator('[data-order="hold"]').click();
await page.waitForTimeout(700);
if (!(await map.locator('[data-order="hold"]').isDisabled())) fail("Hold should be cooling down");
if ((await map.locator(".radio p").count()) <= before) fail("Hold produced no radio line");
await page.screenshot({ path: "shots/story-2-orders.png" });

// Then a normal run at real speed: a few decisions without any staging.
const page2 = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page2.on("pageerror", (e) => errors.push("p2 " + e.stack.split("\n").slice(0,4).join(" | ")));
await page2.goto("http://localhost:5220/?seed=19");
await page2.waitForSelector("#ob-name, #desk .ic");
if (await page2.locator("#ob-name").count()) { await page2.fill("#ob-name", "Amos"); await page2.click("[data-sign]"); }
await page2.waitForSelector("#desk .ic");
await page2.click('[data-open="hr"]');
for (let i = 0; i < 3; i++) await page2.locator("[data-hire]:not([disabled])").first().click().catch(() => {});
await page2.click('[data-open="map"]');
const map2 = page2.locator('.win[data-app="map"]');
for (const box of await map2.locator("input[data-pick]").all()) await box.check();
const cb = await map2.locator("canvas.map").boundingBox();
for (const [fx, fy] of [[0.4, 0.5], [0.8, 0.3]]) await map2.locator("canvas.map").click({ position: { x: cb.width * fx, y: cb.height * fy } });
await map2.locator("[data-send]").click();
let decisions = 0;
const t0 = Date.now();
while (!(await map2.locator(".debrief").count()) && Date.now() - t0 < 150000) {
  await page2.waitForTimeout(500);
  if (await map2.locator("[data-answer]").count()) { await map2.locator('[data-answer="0"]').first().click().catch(() => {}); decisions++; }
  else if (await map2.locator("[data-threat]").count()) { await map2.locator('[data-threat="0"]').first().click().catch(() => {}); decisions++; }
  else if (decisions < 3 && (await map2.locator('[data-order="push"]:not([disabled])').count())) { await map2.locator('[data-order="push"]').click().catch(() => {}); decisions++; }
}
console.log(`real-speed run: ${Math.round((Date.now() - t0) / 1000)}s, decisions ${decisions}`);
if (decisions < 2) fail("fewer than two decisions in a whole run");
await page2.screenshot({ path: "shots/story-3-run.png" });

await browser.close();
await server.close();
if (errors.length) { console.log("ERRORS\n" + errors.join("\n")); process.exit(1); }
console.log("story ok");
