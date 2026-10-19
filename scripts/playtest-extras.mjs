// Clip button: after a few seconds of feed, "Clip last 30 seconds" downloads a non-empty WebM.
// Also checks the facility tray indicators and the Copy day summary menu item.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5305 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.context().grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
await page.goto("http://localhost:5305/?seed=7");
await page.waitForSelector("#ob-name, #desk .ic");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .ic");
await page.click('[data-open="hr"]');
for (let i = 0; i < 2; i++) { await page.locator('[data-fold][aria-expanded="false"]').first().click({ timeout: 400 }).catch(() => {}); await page.locator("[data-hire]:not([disabled])").first().click(); }
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
for (const box of await map.locator("input[data-pick]").all()) await box.check();
const cb = await map.locator("canvas.map").boundingBox();
for (const [fx, fy] of [[0.3, 0.5], [0.55, 0.4], [0.8, 0.5]]) await map.locator("canvas.map").click({ position: { x: cb.width * fx, y: cb.height * fy } });
if (!/3 of 5 pins/.test(await map.innerText())) errors.push("three pins were not counted");
await map.locator("[data-send]").click();
const cam = map.locator("canvas.bodycam");
await cam.waitFor();
const clip = map.locator("[data-clip]");
if (await clip.isHidden()) errors.push("clip button hidden although MediaRecorder exists");
await page.waitForTimeout(4500);
const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 10000 }), clip.click()]);
const path = await dl.path();
const { statSync } = await import("node:fs");
const size = statSync(path).size;
if (!/\.webm$/.test(dl.suggestedFilename())) errors.push("clip is not a .webm: " + dl.suggestedFilename());
if (size < 1000) errors.push("clip is nearly empty: " + size);

// Day summary from the Start menu.
await page.click(".start");
await page.click('.startmenu button:has-text("Copy day summary")');
const text = await page.evaluate(() => navigator.clipboard.readText()).catch(() => "");
if (text && !/^Day \d+, \d+ lost, \$[\d,]+$/.test(text)) errors.push("bad day summary: " + text);

// Facility tray indicators appear once something is installed.
const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const g = newGame(5, "Amos");
g.tutorial = 4;
g.catchphrase = "Rise and grind";
g.upgrades = { mast: 2, security: 1, lab: 1, dispatch: 1 };
const p2 = await (await browser.newContext()).newPage({ viewport: { width: 1400, height: 800 } });
await p2.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, JSON.stringify(g));
await p2.goto("http://localhost:5305/?fast");
await p2.waitForSelector("[data-clockin]", { timeout: 20000 });
await p2.click("[data-clockin]");
await p2.waitForSelector("#desk .ic");
await p2.waitForSelector("[data-fac]:not([hidden])", { timeout: 5000 });
const fac = await p2.locator("[data-fac]").innerText();
if (!/TEL 3/.test(fac) || !/ANTII/.test(fac) || !/CAM/.test(fac) || !/BN 2/.test(fac)) errors.push("tray indicators wrong: " + fac);
await browser.close();
await server.close();
if (errors.length) { console.error("FAIL\n" + errors.join("\n")); process.exit(1); }
console.log(`extras playtest ok (clip ${size} bytes, summary "${text}")`);
