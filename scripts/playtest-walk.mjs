// Headless play-test of walking the office (src/ui/walk3d.ts): stand up from
// the still view, walk down the hall, check the walls stop you, see the props
// and the figure, and walk back to the desk to sit down. Screenshots go to
// shots/walk-*.png; fails on any page error.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const PORT = 5225;
const server = await createServer({ server: { port: PORT }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
});
const errors = [];
const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exitCode = 1;
};
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "warning" && /walking failed/.test(m.text()) && errors.push(m.text()));
await page.goto(`http://localhost:${PORT}/?seed=7&fast&office`);
await page.waitForSelector(".ic, #ob-name, [data-clockin]");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForFunction(() => window.debugOffice?.().loaded);
await page.click(".office-stand");
await page.waitForSelector(".walk canvas", { timeout: 30000 });
await page.waitForTimeout(800);
await page.screenshot({ path: "shots/walk-1-standing.png" });
const w = (o) => page.evaluate((o) => window.debugWalk(o), o);
console.log("standing:", JSON.stringify(await w()));

// Turn toward the hallway and walk for two seconds.
await w({ at: [0.9, -0.5], yaw: 0, keys: ["w"] });
await page.waitForTimeout(2000);
await w({ keys: [] });
const walked = await w();
console.log("walked to:", walked.at);
if (!(walked.at[1] > 0.5)) fail("walking forward should move you down the hall");
await page.screenshot({ path: "shots/walk-2-hall.png" });

// Into the right-hand wall: you stop at it.
await w({ at: [1.6, 4.6], yaw: -90, keys: ["w"] });
await page.waitForTimeout(1500);
await w({ keys: [] });
const wall = await w();
console.log("at the wall:", wall.at);
if (wall.at[0] > 2.6 - 0.2) fail("the wall should stop you");

// Everything bought, and something at the end of the hall.
await page.evaluate(() => window.debugOffice({ upgrades: { breakroom: 4, dispatch: 4, lab: 4, security: 4, mast: 4 }, floor2: true }));
await w({ at: [1.2, 5.0], yaw: 5, figure: true });
await page.waitForTimeout(400);
const up = await w();
console.log("props:", up.props.length, "figure:", up.figure);
if (!up.props.includes("up_breakroom_2") || !up.figure) fail("props and the figure should show");
await page.screenshot({ path: "shots/walk-3-upgraded.png" });
await w({ at: [1.3, 12.2], yaw: 3 });
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/walk-4-figure.png" });
await w({ figure: false, lights: false });
await page.waitForTimeout(300);
await page.screenshot({ path: "shots/walk-5-dark.png" });
await w({ lights: true });

// The vending machine, then back to the desk and sit down.
await w({ at: [1.3, 7.6], yaw: -90 });
await page.waitForTimeout(200);
console.log("facing:", (await w()).focus);
await w({ at: [-0.6, 0.1], yaw: 0 });
await page.waitForTimeout(200);
const atDesk = await w();
console.log("at desk, facing:", atDesk.focus);
if (atDesk.focus !== "crt") fail("standing at the desk facing the CRT should offer to sit down");
await page.keyboard.press("e");
await page.waitForSelector(".office[hidden]", { state: "attached", timeout: 4000 });
console.log("sat down:", await page.evaluate(() => window.debugOffice().mode));

// A phone held sideways: tap Stand up, push the left thumb forward.
const phone = await browser.newPage({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
phone.on("pageerror", (e) => errors.push(e.message));
await phone.goto(`http://localhost:${PORT}/?seed=8&fast&office`);
await phone.waitForSelector(".ic, #ob-name, [data-clockin]");
if (await phone.locator("#ob-name").count()) {
  await phone.fill("#ob-name", "Amos");
  await phone.click("[data-sign]");
}
await phone.waitForFunction(() => window.debugOffice?.().loaded);
await phone.tap(".office-stand");
await phone.waitForSelector(".walk canvas", { timeout: 30000 });
const cdp = await phone.context().newCDPSession(phone);
const touch = (type, x, y) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }] });
await touch("touchStart", 150, 280);
await touch("touchMove", 150, 220);
await phone.waitForTimeout(1200);
await touch("touchEnd");
const moved = await phone.evaluate(() => window.debugWalk());
console.log("phone walked to:", moved.at);
if (!(moved.at[1] > -0.4)) fail("the left thumb should walk you forward");
await phone.screenshot({ path: "shots/walk-6-phone.png" });

if (errors.length) fail(errors.join("\n"));
console.log(process.exitCode ? "EXIT 1" : "EXIT 0");
await browser.close();
await server.close();
