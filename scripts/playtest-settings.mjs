// Play-test for the Employee Handbook: volume is remembered, the save can be
// exported and loaded back, and "Start over" wipes it. Screenshot: shots/settings-handbook.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync, readFileSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5210 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:5210/?seed=61&fast`);
await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.click('[data-open="handbook"]');
const hb = page.locator('.win[data-app="handbook"]');

await hb.locator("[data-vol]").fill("35");
console.log("volume stored:", await page.evaluate(() => localStorage.getItem("out-of-office.volume")));
await page.screenshot({ path: "shots/settings-handbook.png" });

// Make the save recognisable, export it, wreck it, import it.
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.cash = 7777;
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.goto(`http://localhost:5210/?fast`);
await page.waitForSelector("[data-clockin], #desk .win");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .win");
await page.click('[data-open="handbook"]');
const [dl] = await Promise.all([page.waitForEvent("download"), hb.locator("[data-export]").click()]);
const path = await dl.path();
const exported = JSON.parse(readFileSync(path, "utf8"));
console.log("exported cash:", exported.cash, "| version:", exported.version);

await hb.locator("[data-reset]").click();
await page.locator(".dlg-btns").getByRole("button", { name: "Start over" }).click();
await page.waitForSelector("#ob-name, [data-clockin]");
console.log("save after reset:", await page.evaluate(() => localStorage.getItem("out-of-office.save")));

await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.click('[data-open="handbook"]');
await hb.locator("[data-file]").setInputFiles(path);
await page.locator(".dlg-btns").getByRole("button", { name: "Replace" }).click();
await page.waitForSelector("[data-clockin], #desk .win");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .win");
const cash = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).cash);
console.log("cash after import:", cash);

console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || exported.cash !== 7777 || cash !== 7777) process.exit(1);
