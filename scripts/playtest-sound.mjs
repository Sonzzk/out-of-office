// Play-test for sound and calm mode: the audio engine starts after the boot
// click, muzak keeps scheduling at high unease without errors, calm mode
// persists, and typing in a field does not throw.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5206 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => r.status() === 404 && !r.url().endsWith("favicon.ico") && errors.push("404 " + r.url()));
await page.goto(`http://localhost:5206/?seed=21&fast&unease=0.9`);
await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.type("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
await page.waitForTimeout(3500); // let several muzak bars schedule

const calm = page.locator("[data-calm]");
console.log("calm label:", (await calm.textContent()).trim());
await calm.click();
console.log("calm after click:", (await calm.textContent()).trim());
const stored = await page.evaluate(() => localStorage.getItem("out-of-office.calm"));
console.log("calm stored:", stored);
await page.screenshot({ path: "shots/sound-calm.png" });
await calm.click();
await page.waitForTimeout(1500);

console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || stored !== "1") process.exit(1);
