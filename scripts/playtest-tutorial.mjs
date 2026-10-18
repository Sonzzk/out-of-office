// Play-test for Employee Orientation: the card follows a fresh game through
// hire, send, sell and close-the-books, and it can be skipped.
// Screenshots go to shots/tutorial-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5209 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];

async function fresh(seed) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:5209/?seed=${seed}&fast`);
  await page.waitForSelector("#ob-name, #desk .ic");
  if (await page.locator("#ob-name").count()) {
    await page.fill("#ob-name", "Amos");
    await page.click("[data-sign]");
  }
  await page.waitForSelector("#desk .ic");
  return page;
}
const stepText = async (page) => ((await page.locator(".tutorial b").textContent()) ?? "").trim();

let page = await fresh(51);
console.log("start:", await stepText(page), "| pulsing icon:", await page.locator(".tut-hint").getAttribute("data-open"));
await page.screenshot({ path: "shots/tutorial-1-hire.png" });
await page.click('[data-open="hr"]');
await page.locator("[data-hire]:not([disabled])").first().click();
await page.waitForTimeout(200);
console.log("after hire:", await stepText(page), "| pulsing icon:", await page.locator(".tut-hint").getAttribute("data-open"));
await page.screenshot({ path: "shots/tutorial-2-send.png" });
await page.context().close();

page = await fresh(52);
await page.click("[data-skip]");
await page.waitForTimeout(200);
const hidden = await page.locator(".tutorial").isHidden();
console.log("hidden after skip:", hidden, "| pulses left:", await page.locator(".tut-hint").count());
await page.goto("http://localhost:5209/?fast");
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
const stillHidden = await page.locator(".tutorial").isHidden();
console.log("still hidden after reload:", stillHidden);

console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || !hidden || !stillHidden) process.exit(1);
