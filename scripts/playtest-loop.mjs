// Headless play-test of the thin loop: hire, plan, run, debrief, sell.
// Saves screenshots to shots/loop-*.png and fails on any page error.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5198 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
const seed = process.env.SEED ?? "7";
await page.goto(`http://localhost:5198/?seed=${seed}&fast`);
// Get past onboarding when the boot screen asks for it.
await page.waitForSelector(".win, #ob-name, [data-clockin]");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.screenshot({ path: "shots/loop-1-boot.png" });

// Hire two applicants.
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) await page.locator("[data-hire]:not([disabled])").first().click();
await page.screenshot({ path: "shots/loop-2-hired.png" });
const crew = await page.locator(".hr .roster .crewrow").count();
console.log("crew hired:", crew);

// Plan: pick everyone, drop a marker on the far right of the map, send.
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const canvas = map.locator("canvas");
const cb = await canvas.boundingBox();
await canvas.click({ position: { x: cb.width * 0.85, y: cb.height * 0.3 } });
console.log("odds:", await map.locator(".odds b").textContent());
await page.screenshot({ path: "shots/loop-3-plan.png" });
await map.locator("[data-send]").click();
await page.waitForTimeout(1300);
await page.screenshot({ path: "shots/loop-4-run.png" });
await map.locator(".debrief").waitFor({ timeout: 30000 });
console.log("debrief:", (await map.locator(".debrief").textContent()).trim());
await page.screenshot({ path: "shots/loop-5-debrief.png" });

// Sell whatever came back.
await page.click('[data-open="ledger"]');
const ledger = page.locator('.win[data-app="ledger"]');
const before = await ledger.locator(".cash b").textContent();
const sellable = await ledger.locator("[data-sell]").count();
for (let i = 0; i < sellable; i++) await ledger.locator("[data-sell]").first().click();
console.log("cash:", before, "->", await ledger.locator(".cash b").textContent(), `(${sellable} sold)`);
await page.screenshot({ path: "shots/loop-6-ledger.png" });
await page.click('[data-open="hr"]');
await page.locator('.win[data-app="hr"] .tb').click();
await page.screenshot({ path: "shots/loop-8-crew.png" });
await page.click('[data-open="inbox"]');
await page.screenshot({ path: "shots/loop-7-inbox.png" });

// Reload: the save should bring everything back.
await page.goto(`http://localhost:5198/?fast`);
await page.waitForSelector("#desk .win, [data-clockin]");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.click('[data-open="hr"]');
console.log("crew after reload:", await page.locator(".hr .roster .crewrow").count());

// Index and Lab, with a save that already knows a few things.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.index.smiler = { stage: 3, by: s.crew[0]?.name, count: 2, dataSold: 0 };
  s.index.hound = { stage: 2, by: s.crew[0]?.name, count: 0, dataSold: 0 };
  s.index.faceling = { stage: 1, by: s.crew[0]?.name, count: 0, dataSold: 0 };
  s.index["almond-water"] = { stage: 1, by: s.crew[0]?.name, count: 1, dataSold: 0 };
  s.loot.push({ id: 9001, itemId: "sample-hound", foundBy: s.crew[0]?.name ?? "?" });
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5198/?fast`);
await page.waitForSelector("#desk .win, [data-clockin]");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.click('[data-open="index"]');
const index = page.locator('.win[data-app="index"]');
await index.locator('[data-entry="smiler"]').click();
await page.screenshot({ path: "shots/loop-9-index.png" });
await index.locator("[data-selldata]").click();
await index.locator('[data-entry="faceling"]').click();
await page.screenshot({ path: "shots/loop-10-index-seen.png" });
await page.click('[data-open="lab"]');
const lab = page.locator('.win[data-app="lab"]');
await lab.locator("[data-research]").first().click();
console.log("lab:", (await lab.locator(".bench").textContent()).trim().replace(/\s+/g, " "));
await page.click('[data-open="ledger"]');
await page.screenshot({ path: "shots/loop-11-lab-ledger.png" });

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
