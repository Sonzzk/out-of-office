// Play-test for an infected office: stage memos with your name, warped memos,
// the extra HR row, the deep clean and the clock-in line.
// Screenshots go to shots/infected-*.png; fails on any page error.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5200 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5200/?seed=41&fast`);
await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  if (await page.locator("#ob-catch").count()) await page.fill("#ob-catch", "Synergy is a lifestyle");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.click('[data-open="hr"]');
await page.locator("[data-hire]:not([disabled])").first().click();

// Jump ahead: the office is badly infected.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.infection = 79;
  s.cash = 3000;
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5200/?fast`);
await page.waitForSelector("[data-clockin], #desk .win");
await page.screenshot({ path: "shots/infected-1-clockin.png" });
console.log("clock-in:", await page.locator(".welcome").textContent().catch(() => "-"));
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .win");

await page.click('[data-open="ledger"]');
await page.locator('.win[data-app="ledger"] [data-endday]').click();
await page.click('[data-open="inbox"]');
const inbox = page.locator('.win[data-app="inbox"]');
console.log("inbox:", (await inbox.locator(".list").textContent()).replace(/\s+/g, " ").slice(0, 240));
await inbox.locator(".msg", { hasText: "Synergy" }).first().click().catch(() => {});
await page.screenshot({ path: "shots/infected-2-memo.png" });
await inbox.locator(".msg", { hasText: "Welcome aboard" }).click();
console.log("warped words:", await inbox.locator(".warp").count());
await page.screenshot({ path: "shots/infected-3-warped.png" });

await page.click('[data-open="hr"]');
console.log("phantom row:", await page.locator(".crewrow.phantom").count());
await page.locator(".crewrow.phantom").scrollIntoViewIfNeeded();
await page.screenshot({ path: "shots/infected-4-hr.png" });
await page.click('[data-open="ledger"]');
const before = await page.locator('.win[data-app="ledger"] .cash b').textContent();
await page.locator('.win[data-app="ledger"] [data-clean]').click();
console.log("deep clean:", before, "->", await page.locator('.win[data-app="ledger"] .cash b').textContent());
console.log("tray:", (await page.locator(".tray").textContent()).replace(/\s+/g, " "));

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
