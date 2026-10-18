// Headless play-test: boots the built game, opens apps, drags a window, and
// saves screenshots to shots/. Run `npm run build` first.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];

for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5199/?seed=7");
  await page.waitForSelector(".win");
  // On a phone the first-boot windows cover the icons; close them like a player would.
  if (viewport.width < 640) {
    while (await page.locator(".win").count()) await page.locator(".win.active .tb button").click();
  }
  await page.click('[data-open="hr"]');
  const tb = page.locator('.win[data-app="hr"] .tb');
  const box = await tb.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 140, box.y + 160, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `shots/${name}.png` });
  console.log(name, "windows open:", await page.locator(".win").count());
}

await browser.close();
await server.close();
if (errors.length) {
  console.error("Page errors:", errors);
  process.exit(1);
}
