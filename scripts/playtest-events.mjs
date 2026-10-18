// Play-test for overnight events: close the books until an event memo
// arrives, answer it from the inbox. Screenshots go to shots/events-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5204 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5204/?seed=${process.env.SEED ?? "21"}&fast`);
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
  s.cash = 20000;
  s.heat = 45; // makes the inspector likely
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5204/?fast`);
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");

// Close the books until a memo asks for a decision.
await page.click('[data-open="ledger"]');
const ledger = page.locator('.win[data-app="ledger"]');
const inbox = page.locator('.win[data-app="inbox"]');
const seen = [];
for (let d = 0; d < 12 && seen.length < 3; d++) {
  await ledger.locator("[data-endday]").click();
  await page.waitForTimeout(150);
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.click('[data-open="inbox"]');
  const ask = inbox.locator(".msg:has(.ask)");
  if (await ask.count()) {
    await ask.first().click();
    const subject = (await inbox.locator(".msg.on span").first().textContent()).trim();
    await page.screenshot({ path: `shots/events-${seen.length + 1}-ask.png` });
    await inbox.locator("[data-choice]:not([disabled])").first().click();
    const result = (await inbox.locator(".decided").textContent()).trim();
    seen.push(subject);
    console.log("event:", subject, "->", result);
    await page.screenshot({ path: `shots/events-${seen.length}-answered.png` });
  }
  await page.click('[data-open="ledger"]');
}
console.log("events answered:", seen.length);

await browser.close();
await server.close();
if (errors.length || !seen.length) {
  console.error("Page errors:", errors, "events:", seen.length);
  process.exit(1);
}
