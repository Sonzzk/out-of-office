// Headless play-test of the office view (src/ui/office3d.ts): the room shows
// first, clicking the CRT sits you at the desktop, "Look up" brings the room
// back, bought upgrades appear as props, and the lights can die. Screenshots
// go to shots/office-*.png; fails on any page error.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const PORT = 5224;
const server = await createServer({ server: { port: PORT }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/?seed=7&fast&office`);
await page.waitForSelector(".ic, #ob-name, [data-clockin]");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector(".office:not([hidden])");
await page.waitForFunction(() => window.debugOffice?.().loaded);
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/office-1-room.png" });
const room = await page.evaluate(() => window.debugOffice());
console.log("room:", room.mode, room.layers.join(","));
if (room.mode !== "room") fail("the office should show first");

// Sit down: click the middle of the CRT screen.
const crt = await page.evaluate(async () => {
  const { OFFICE_CRT } = await import("/src/data/office3d.ts");
  const xs = OFFICE_CRT.map((p) => p[0]), ys = OFFICE_CRT.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
});
await page.mouse.click(1366 * crt[0], 768 * crt[1]);
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/office-2-zoom.png" });
await page.waitForSelector(".office[hidden]", { state: "attached", timeout: 3000 });
await page.screenshot({ path: "shots/office-3-desktop.png" });
console.log("sat down:", await page.evaluate(() => window.debugOffice().mode));

// Look up again, then buy everything and let something stand in the hall.
await page.click("[data-lookup]");
await page.waitForSelector(".office:not([hidden])");
await page.waitForTimeout(800);
await page.evaluate(() =>
  window.debugOffice({ upgrades: { breakroom: 4, dispatch: 4, lab: 4, security: 4, mast: 4 }, floor2: true, figure: true }),
);
await page.screenshot({ path: "shots/office-4-upgraded.png" });
const up = await page.evaluate(() => window.debugOffice());
console.log("upgraded layers:", up.layers.length);
if (!up.layers.includes("up_breakroom_1") || !up.layers.includes("fx_door_open")) fail("upgrades should show in the room");
await page.evaluate(() => window.debugOffice({ upgrades: { breakroom: 1, dispatch: 0, lab: 0, security: 0, mast: 1 }, figure: false }));
await page.screenshot({ path: "shots/office-5-tier1.png" });
await page.evaluate(() => window.debugOffice({ lights: false, figure: true }));
await page.screenshot({ path: "shots/office-6-dark.png" });
await page.evaluate(() => window.debugOffice({ lights: true, figure: false }));

// The vending machine answers a click.
const vend = await page.evaluate(async () => {
  const { OFFICE_HOT } = await import("/src/data/office3d.ts");
  const b = OFFICE_HOT.up_breakroom_1;
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
});
await page.mouse.click(1366 * vend[0], 768 * vend[1]);
await page.waitForSelector(".office .toast");
console.log("vending:", (await page.locator(".office .toast").first().textContent()).trim());

// Keyboard: Enter on the room sits you down.
await page.locator(".office canvas").focus();
await page.keyboard.press("Enter");
await page.waitForSelector(".office[hidden]", { state: "attached", timeout: 3000 });

// A phone held upright letterboxes the room instead of cropping the monitor away.
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
phone.on("pageerror", (e) => errors.push(e.message));
await phone.goto(`http://localhost:${PORT}/?seed=8&fast&office`);
await phone.waitForSelector(".ic, #ob-name, [data-clockin]");
if (await phone.locator("#ob-name").count()) {
  await phone.fill("#ob-name", "Amos");
  await phone.click("[data-sign]");
}
await phone.waitForFunction(() => window.debugOffice?.().loaded);
await phone.waitForTimeout(300);
await phone.screenshot({ path: "shots/office-7-phone.png" });

// Without ?office, play-tests still land straight on the desktop.
const plain = await browser.newPage({ viewport: { width: 1200, height: 800 } });
await plain.goto(`http://localhost:${PORT}/?seed=9&fast`);
await plain.waitForSelector(".ic, #ob-name, [data-clockin]");
if (await plain.locator(".office:not([hidden])").count()) fail("?fast alone should skip the room");

if (errors.length) fail(errors.join("\n"));
console.log(process.exitCode ? "EXIT 1" : "EXIT 0");
await browser.close();
await server.close();
