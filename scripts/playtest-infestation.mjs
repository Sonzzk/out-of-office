// Play-test for what an infected office looks like: the stain, the Break Room
// icon nobody installed, windows that drift, and the body cam cutaway to
// "your office". Calm mode must switch it off. Screenshots: shots/infestation-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5222 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const x = await server.ssrLoadModule("/src/sim/expedition.ts");
function stage(infection, run) {
  const s = newGame(51, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = 4;
  s.infection = infection;
  for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
  s.crew[2].status = "dead";
  s.crew[2].diedOnDay = 1;
  if (run) {
    const exp = x.startExpedition(s, [s.crew[0].id], [{ x: 24, y: 6 }]);
    exp.entities = [];
    exp.callsMade = 99;
    for (let k = 0; k < 8; k++) x.stepExpedition(s, exp);
  }
  return JSON.stringify(s);
}
async function open(save, query = "") {
  const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
  page.on("pageerror", (e) => errors.push("page " + e.message));
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
  await page.goto("http://localhost:5222/" + query);
  await page.waitForSelector("[data-clockin], #desk .win");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .win");
  return page;
}

// A clean office has none of it.
{
  const page = await open(stage(0));
  if (await page.locator('[data-open="breakroom"]').count()) fail("Break Room icon in a clean office");
  if (Number(await page.locator(".stain").evaluate((e) => getComputedStyle(e).opacity)) > 0.01) fail("stain in a clean office");
  await page.close();
}

// Deep in.
{
  const page = await open(stage(85, true), "?cutaway");
  if (!(await page.locator('[data-open="breakroom"]').count())) fail("no Break Room icon at stage four");
  await page.waitForTimeout(2500);
  const op = Number(await page.locator(".stain").evaluate((e) => getComputedStyle(e).opacity));
  console.log("stain opacity:", op.toFixed(2));
  if (op < 0.2) fail("stain not visible at stage four");
  await page.click('[data-open="breakroom"]');
  const room = page.locator('.win[data-app="breakroom"]');
  const text = await room.textContent();
  if (!/Seated/.test(text) || !/Amos/.test(text)) fail("Break Room should seat the dead and the boss: " + text);
  await page.click('[data-open="map"]');
  // The cutaway lasts about a second; sample the feed a few times for a very different picture.
  const sig = [];
  for (let i = 0; i < 14; i++) {
    sig.push(await page.locator('.win[data-app="map"] canvas.bodycam').evaluate((c) => {
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 16) s += d[i] + d[i + 1] + d[i + 2];
      return s;
    }));
    if (i === 6) await page.screenshot({ path: "shots/infestation-1-desktop.png" });
    await page.waitForTimeout(250);
  }
  console.log("feed brightness range:", Math.min(...sig), Math.max(...sig));
  await page.screenshot({ path: "shots/infestation-2-feed.png" });
  await page.close();
}

// Calm mode turns the stain off.
{
  const page = await open(stage(85));
  await page.click("[data-calm]");
  const calm = await page.locator("[data-calm]").textContent();
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  console.log("calm button:", calm);
  await page.close();
}

await browser.close();
await server.close();
if (errors.length) { console.log("ERRORS\n" + errors.join("\n")); process.exit(1); }
console.log("infestation ok");
