// Play-test for the first day and the money sinks: a profit line on the debrief,
// a first-sale bonus, Sell all, training, office projects on the desktop and
// estate recovery. Screenshots go to shots/economy-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5218 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5218/?seed=21&fast`);
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) await page.locator("[data-hire]:not([disabled])").first().click();
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const cb = await map.locator("canvas.map").boundingBox();
await map.locator("canvas.map").click({ position: { x: cb.width * 0.8, y: cb.height * 0.45 } });
await map.locator("[data-send]").click();
for (let i = 0; i < 400 && !(await map.locator(".debrief").count()); i++) {
  if (await map.locator("[data-answer]").count()) await map.locator('[data-answer="0"]').first().click().catch(() => {});
  await page.waitForTimeout(100);
}
if (!(await map.locator(".debrief .profit").count())) fail("debrief has no profit line");
else console.log("profit line:", (await map.locator(".debrief .profit").textContent()).trim());
await page.screenshot({ path: "shots/economy-1-debrief.png" });

await page.click('[data-open="ledger"]');
const led = page.locator('.win[data-app="ledger"]');
const before = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).cash);
if (!(await led.locator("[data-sellall]").count())) fail("no Sell all button");
else {
  await led.locator("[data-sellall]").click();
  await led.locator("[data-sellgo]").click();
}
const after = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).cash);
const bonus = await led.locator("tr", { hasText: "first-sale bonus" }).count();
console.log("cash", before, "->", after, "bonus rows:", bonus);
if (after <= before || bonus !== 1) fail("sell all or the bonus did not pay out");
await page.screenshot({ path: "shots/economy-2-ledger.png" });

// Money sinks: training, projects, estate recovery.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.cash = 40000;
  s.crew[0].status = "dead";
  s.crew[0].diedOnDay = s.day;
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5218/?fast`);
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
const hr = page.locator('.win[data-app="hr"]');
if (!(await hr.locator("[data-train]:not([disabled])").count())) fail("no training button");
else await hr.locator("[data-train]:not([disabled])").first().click();
if (!(await page.locator("[data-floor]").isHidden())) fail("FL 2 shown before the second floor is built");
await page.click('[data-open="facilities"]');
const fac = page.locator('.win[data-app="facilities"]');
for (const id of ["memorial", "cage", "corner", "floor2"]) {
  await fac.locator(`[data-project="${id}"]`).click();
  await page.locator(".dialog .btn", { hasText: "Build" }).click();
}
await fac.locator("[data-recover]").first().click();
await page.waitForTimeout(1300);
const cls = await page.locator("#desk").getAttribute("class");
console.log("desk classes:", cls);
if (!/p-memorial/.test(cls) || !/p-cage/.test(cls) || !/p-corner/.test(cls) || !/p-floor2/.test(cls)) fail("projects did not reach the desktop");
if (!(await page.locator(".sticky-memorial").count())) fail("no memorial sticky note");
if (await page.locator("[data-floor]").isHidden()) fail("FL 2 not shown");
await page.screenshot({ path: "shots/economy-3-projects.png" });

await browser.close();
await server.close();
if (errors.length) { console.log("ERRORS\n" + errors.join("\n")); process.exit(1); }
console.log("economy ok");
