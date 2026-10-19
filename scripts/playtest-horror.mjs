// Play-test for the infection ramp: at stage 4 the memo warps, a coworker
// goes off, the map shows duplicated rooms and the chrome glitches.
// Screenshots go to shots/horror-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5207 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5207/?seed=33&fast`);
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 3; i++) { await page.locator('[data-fold][aria-expanded="false"]').first().click({ timeout: 400 }).catch(() => {}); await page.locator("[data-hire]:not([disabled])").first().click(); }
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.infection = 85;
  s.infectionSeen = 4;
  for (const i of [1, 2, 3, 4]) s.memos.push({ id: 900 + i, day: s.day, from: "HR", subject: `Memo ${i}`, body: "Please remember to submit your reports before the weekend. Several employees have reported unusual things near the break room.", read: false });
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5207/?fast&stage=4&unease=0.9`);
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");

await page.click('[data-open="hr"]');
const off = await page.locator(".warpline").count();
console.log("odd coworkers:", off);
await page.screenshot({ path: "shots/horror-1-hr.png" });

await page.click('[data-open="inbox"]');
const warped = await page.locator(".memo .warp").count();
console.log("warped spans in memos:", warped);
await page.screenshot({ path: "shots/horror-2-memo.png" });

await page.click('[data-open="map"]');
await page.waitForTimeout(400);
await page.screenshot({ path: "shots/horror-3-map.png" });

// Let the glitches fire for a while and check they do not break the desktop.
await page.waitForTimeout(12_000);
await page.screenshot({ path: "shots/horror-4-glitch.png" });
console.log("windows still open:", await page.locator("#desk .win").count());
console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || off === 0) process.exit(1);
