// Play-test for two crews at once, a radio call, heat and HR jobs.
// Screenshots go to shots/two-*.png; fails on any page error.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
// ?fast ticks every 40ms, too quick to read a call, so slow it down a little.
await page.goto(`http://localhost:5199/?seed=${process.env.SEED ?? "21"}&fast`);
await page.waitForSelector(".ic, #ob-name, [data-clockin]");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.cash = 5000; // enough to hire four
  s.upgrades = { mast: 2 }; // calls wait twice as long, so a slow test can still answer
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5199/?fast`);
await page.waitForSelector("#desk .ic, [data-clockin]");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");

await page.click('[data-open="hr"]');
for (let i = 0; i < 3; i++) {
  // Applicants fold away once there is a crew; unfold them for the next hire.
  const fold = page.locator('[data-fold][aria-expanded="false"]');
  if (await fold.count()) await fold.first().click();
  await page.locator("[data-hire]:not([disabled])").first().click();
}
const hr = page.locator('.win[data-app="hr"]');
// The last hire goes on a safe contract instead of into Level 0.
await hr.locator('[data-job="contract"]').last().click();

await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
const canvas = map.locator("canvas");
const cb = await canvas.boundingBox();
async function send(n, x, y) {
  // Each tick of the box re-renders the form, so pick by id, not position.
  const ids = await map.locator("input[data-pick]").evaluateAll((els) => els.map((e) => e.dataset.pick));
  for (const id of ids.slice(0, n)) await map.locator(`input[data-pick="${id}"]`).check();
  await canvas.click({ position: { x: cb.width * x, y: cb.height * y } });
  await map.locator("[data-send]").click();
}
await send(1, 0.9, 0.15);
await map.locator('[data-run="plan"]').click();
await send(1, 0.9, 0.85);
await page.waitForTimeout(200);
await page.screenshot({ path: "shots/two-1-both-out.png" });
console.log("tabs:", await map.locator(".runtabs").textContent());

// Answer the first radio call that comes in.
let answered = false;
for (let i = 0; i < 300 && !answered; i++) {
  const ring = map.locator(".runtabs .tab:has(.ring)");
  if (await ring.count()) {
    await ring.first().click();
    // The call can run out while we switch tabs; then wait for the next one.
    const button = map.locator("[data-answer]").first();
    await button.waitFor({ timeout: 1500 }).catch(() => {});
    if (await button.count()) {
      const text = (await map.locator(".radio p").last().textContent()).trim();
      answered = await button.click({ timeout: 2000 }).then(() => true, () => false);
      await page.screenshot({ path: "shots/two-2-call.png" });
      console.log("call:", text);
    }
  }
  if (!(await map.locator(".runtabs").textContent()).includes("out")) break;
  await page.waitForTimeout(20);
}
console.log("answered a call:", answered);
await page.waitForFunction(() => !document.querySelector(".runtabs")?.textContent.includes("out"), null, { timeout: 30000 });
await page.screenshot({ path: "shots/two-3-back.png" });

await page.click('[data-open="ledger"]');
const ledger = page.locator('.win[data-app="ledger"]');
console.log("heat:", (await ledger.locator(".heat").textContent()).trim().replace(/\s+/g, " "));
await page.screenshot({ path: "shots/two-4-ledger.png" });
await ledger.locator("[data-endday]").click();
if (await page.locator(".dialog .btn", { hasText: "Close anyway" }).count()) await page.locator(".dialog .btn", { hasText: "Close anyway" }).click(); // pre-close checklist
await page.click('[data-open="inbox"]');
await page.screenshot({ path: "shots/two-5-inbox.png" });
console.log("memos:", (await page.locator('.win[data-app="inbox"]').textContent()).replace(/\s+/g, " ").slice(0, 300));

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
