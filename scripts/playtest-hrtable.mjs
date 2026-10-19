// Play-test for the HR crew table, the Lab empty-bench line and window cascade/tiling.
// Screenshots: shots/hrtable-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5332 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const s = newGame(77, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 4;
s.cash = 5000;
for (const w of s.pool.slice(0, 3)) hire(s, w.id);
const save = JSON.stringify(s);

const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push("page " + e.message));
await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
await page.goto("http://localhost:5332/?fast");
await page.waitForSelector("[data-clockin], #desk .ic", { timeout: 8000 }).catch(async () => { console.log(errors, await page.locator("body").innerText()); process.exit(1); });
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");

await page.click(".start");
await page.click('.startmenu [role="menuitem"]:has-text("HR Roster")');
const hr = page.locator('.win[data-app="hr"]');
await hr.waitFor();
const rows = await hr.locator(".roster .crewrow").count();
if (rows !== 3) fail(`expected 3 crew rows, got ${rows}`);
await hr.locator('[data-sort="wage"]').click();
const sorted = await hr.locator('th[aria-sort="descending"] [data-sort]').getAttribute("data-sort");
if (sorted !== "wage") fail("wage column not aria-sort descending");
await hr.locator('[data-sort="wage"]').click();
if ((await hr.locator('th[aria-sort="ascending"]').count()) !== 1) fail("second click did not flip to ascending");
// Fold still works.
const fold = hr.locator("[data-fold]");
const before = await fold.getAttribute("aria-expanded");
await fold.click();
if ((await hr.locator("[data-fold]").getAttribute("aria-expanded")) === before) fail("fold did not toggle");
await page.screenshot({ path: "shots/hrtable-1-hr.png" });
// Bulk contract.
await hr.locator("[data-allcontract]").click();
if (await hr.locator("[data-job]").count()) fail("idle crew remain after bulk contract");

// Lab: one empty-bench line.
await page.click(".start");
await page.click('.startmenu [role="menuitem"]:has-text("Lab")');
const lab = page.locator('.win[data-app="lab"]');
await lab.waitFor();
console.log("lab empty line:", (await lab.locator(".benchempty").textContent()).trim());
if ((await lab.locator(".benchempty").count()) !== 1) fail("expected one empty bench line");

// Cascade and tile.
const pos = await page.evaluate(() => [...document.querySelectorAll(".win")].map((w) => [w.offsetLeft, w.offsetTop]));
console.log("positions:", JSON.stringify(pos));
if (pos.length > 1 && pos[1][0] === pos[0][0] && pos[1][1] === pos[0][1]) fail("windows stacked exactly");
await page.click(".start");
await page.click('.startmenu [role="menuitem"]:has-text("Tile windows")');
const boxes = await page.evaluate(() => [...document.querySelectorAll(".win")].map((w) => w.getBoundingClientRect().toJSON()));
for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
  const a = boxes[i], b = boxes[j];
  if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) fail(`tiled windows ${i} and ${j} overlap`);
}
await page.screenshot({ path: "shots/hrtable-2-tiled.png" });
await browser.close();
await server.close();
console.log(errors.length ? `${errors.length} problems` : "hrtable playtest ok");
process.exit(errors.length ? 1 : 0);
