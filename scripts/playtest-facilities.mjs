// Play-test for the Facilities app: buy upgrades, see a second lab bench,
// and send three crews out at once. Screenshots go to shots/facilities-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5203 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5203/?seed=12&fast`);
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 3; i++) await page.locator("[data-hire]:not([disabled])").first().click();
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.cash = 9000;
  s.loot.push({ id: 9001, itemId: "sample-hound", foundBy: "Amos" }, { id: 9002, itemId: "sample-smiler", foundBy: "Amos" });
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5203/?fast`);
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");

await page.click('[data-open="facilities"]');
const fac = page.locator('.win[data-app="facilities"]');
for (const id of ["dispatch", "lab", "mast", "breakroom"]) {
  await fac.locator(`[data-buy="${id}"]`).click();
  await page.locator(".dialog .btn", { hasText: "Buy" }).click();
}
await page.screenshot({ path: "shots/facilities-1-bought.png" });
console.log("upkeep:", (await fac.locator("p").last().textContent()).trim());

await page.click('[data-open="lab"]');
const lab = page.locator('.win[data-app="lab"]');
for (let i = 0; i < 2; i++) await lab.locator("[data-research]:not([disabled])").first().click();
console.log("benches busy:", await lab.locator(".bench:not(.dim)").count());
await page.screenshot({ path: "shots/facilities-2-lab.png" });

await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
const ids = await map.locator("input[data-pick]").evaluateAll((els) => els.map((e) => e.dataset.pick));
for (let i = 0; i < 3; i++) {
  if (i) await map.locator('[data-run="plan"]').click();
  await map.locator(`input[data-pick="${ids[i]}"]`).check();
  const cb = await map.locator("canvas").boundingBox();
  await map.locator("canvas").click({ position: { x: cb.width * 0.85, y: cb.height * (0.25 + 0.25 * i) } });
  await map.locator("[data-send]").click();
}
await page.waitForTimeout(300);
console.log("runs out:", await map.locator(".runtabs [data-run]:not([data-run=plan])").count());
await page.screenshot({ path: "shots/facilities-3-three-runs.png" });

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
