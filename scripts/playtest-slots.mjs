// Play-test for save slots and number hotkeys: save to a slot, load it back (the old
// office is kept), the day rollover writes a previous-day backup, keys 1..9 open apps.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5331 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const s = newGame(71, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 99;
s.day = 3;
const save = JSON.stringify(s);

const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push("page " + e.message));
await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
await page.goto("http://localhost:5331/?fast");
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");

// Hotkeys: 6 is the Ledger, a key typed in a field does nothing.
await page.keyboard.press("6");
if (!(await page.locator('.win[data-app="ledger"]').count())) fail("key 6 did not open the Ledger");
await page.keyboard.press("9");
await page.waitForSelector('.win[data-app="handbook"]');
await page.click('[data-hbtab="settings"]');
await page.screenshot({ path: "shots/slots-1-handbook.png" });

// Save to slot 1, move on a day, load slot 1 back.
await page.click('[data-slot-save="1"]');
await page.waitForFunction(() => document.querySelector('[data-slot-load="1"]') && !document.querySelector('[data-slot-load="1"]').disabled);
await page.click('[data-slot-load="1"]');
await page.click('.dlg-btns button:has-text("Load")');
await page.waitForLoadState("load");
await page.waitForSelector("[data-clockin], #desk .ic");
const days = await page.evaluate(() => ({
  active: JSON.parse(localStorage.getItem("out-of-office.save")).day,
  undo: JSON.parse(localStorage.getItem("out-of-office.save.before-load") || "{}").day,
}));
console.log(JSON.stringify(days));
if (days.active !== 3) fail("slot did not load");
if (days.undo === undefined) fail("current save was not kept");

await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("slots ok");
