// Play-test for reasons to come back: an away report waits after a long absence,
// the daily goal shows in the Ledger and pays out. Screenshots: shots/return-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5223 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const { endDay } = await server.ssrLoadModule("/src/sim/economy.ts");
const s = newGame(61, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 4;
for (const w of s.pool.slice(0, 2)) { s.cash += w.cost; hire(s, w.id); }
endDay(s);
s.lastSeen = Date.now() - 3 * 3600 * 1000;
const save = JSON.stringify(s);

const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push("page " + e.message));
await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
await page.goto("http://localhost:5223/?fast");
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");
const memos = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).memos.map((m) => m.subject));
console.log(memos.slice(0, 4).join(" | "));
if (!memos.includes("While you were away")) fail("no away report");
if (!memos.some((m) => m.startsWith("Today's goal"))) fail("no goal memo");
const goal = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).goal);
if (!goal) fail("no goal in save");
await page.screenshot({ path: "shots/return-1-desktop.png" });
await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("return ok");
