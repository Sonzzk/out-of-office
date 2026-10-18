// Play-test for touch and accessibility on a tablet-sized touch screen:
// tap to open apps, touch-drag a window, Escape closes it, keyboard reaches the
// icons, and "reduced motion" starts the game in calm mode.
// Screenshot: shots/touch-tablet.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5211 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];

async function open(ctxOptions, query = "") {
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:5211/?seed=71&fast${query}`);
  await page.waitForSelector("#ob-name, #desk .win");
  if (await page.locator("#ob-name").count()) {
    await page.fill("#ob-name", "Amos");
    await page.tap("[data-sign]").catch(() => page.click("[data-sign]"));
  }
  await page.waitForSelector("#desk .win");
  return { ctx, page };
}

// Tablet with touch.
let { ctx, page } = await open({ viewport: { width: 1024, height: 768 }, hasTouch: true, isMobile: false });
await page.tap('[data-open="ledger"]');
const ledger = page.locator('.win[data-app="ledger"]');
const tapped = await ledger.count();
console.log("ledger opened by tap:", tapped);

const before = await ledger.evaluate((el) => el.offsetLeft);
const bar = await ledger.locator(".tb").boundingBox();
const client = await ctx.newCDPSession(page);
const x = bar.x + 60;
const y = bar.y + bar.height / 2;
await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
for (let i = 1; i <= 8; i++) await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x - i * 15, y: y + i * 6 }] });
await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
const after = await ledger.evaluate((el) => el.offsetLeft);
const moved = before - after;
console.log("touch drag moved window:", moved, "px");
const btn = await ledger.locator('.tb button[data-act="close"]').boundingBox();
console.log("close button size:", Math.round(btn.width), "x", Math.round(btn.height));
await page.screenshot({ path: "shots/touch-tablet.png" });

await page.keyboard.press("Escape");
const afterEsc = await page.locator('.win[data-app="ledger"]').count();
console.log("windows after Escape:", afterEsc);

// Keyboard reaches the icons.
await page.locator('[data-open="inbox"]').focus();
await page.keyboard.press("Enter");
const byKey = await page.locator('.win[data-app="inbox"]').count();
console.log("opened by keyboard:", byKey);
console.log("window has dialog role:", await page.locator('.win[data-app="inbox"]').getAttribute("role"));
await ctx.close();

// Reduced motion starts in calm mode.
({ ctx, page } = await open({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" }));
const calmLabel = (await page.locator("[data-calm]").textContent()).trim();
console.log("calm by default with reduced motion:", calmLabel);
await ctx.close();

console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || tapped !== 1 || moved < 100 || afterEsc !== 0 || byKey !== 1 || calmLabel !== "calm: on") process.exit(1);
