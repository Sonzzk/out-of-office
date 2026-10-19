// Play-test for the Memo Inbox (digest, pins, filters, badge), the day card after
// closing the books, the Handbook Guide tab and the Index filter. Port 5322.
// Screenshots: shots/inbox-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5322 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame, addMemo } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const { endDay } = await server.ssrLoadModule("/src/sim/economy.ts");
const s = newGame(61, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 4;
for (const w of s.pool.slice(0, 3)) { s.cash += w.cost; hire(s, w.id); }
s.cash = 5000;
for (let i = 0; i < 9; i++) endDay(s);
s.memos.forEach((m) => (m.read = true));
s.crew[0].status = "dead";
addMemo(s, { from: s.crew[0].name, subject: "Quick question", body: "Is the carpet supposed to move?" });
for (let i = 1; i <= 4; i++) addMemo(s, { from: "Facilities", subject: `Routine notice ${i}`, body: "Nothing to see." });
const save = JSON.stringify(s);

async function open(viewport, tag) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(`${tag} page ${e.message}`));
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
  await page.goto("http://localhost:5322/?fast");
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  return page;
}

// --- Desktop ---
let page = await open({ width: 1280, height: 720 }, "desk");
const memoRows = async () => page.locator(".inbox .msg").count();
if (!(await page.locator('.ic[data-open="inbox"] .badge').count())) fail("no unread badge on the Memo Inbox icon");
if (!(await page.locator('.ic[data-open="inbox"]').getAttribute("title"))) fail("no tooltip on the inbox icon");
if (!(await page.locator(".inbox").count())) await page.click('.ic[data-open="inbox"]');
await page.waitForSelector(".inbox .msg");
const on = (await page.locator(".inbox .msg.on span").first().textContent()) ?? "";
if (!on.includes("Quick question")) fail(`inbox did not open the newest unread story memo: "${on}"`);
await page.screenshot({ path: "shots/inbox-1-desktop.png" });
const all = await memoRows();
await page.click('.inbox [data-filter="story"]');
if ((await memoRows()) >= all) fail("story filter did not narrow the list");
await page.click('.inbox [data-filter="staff"]');
await page.click('.inbox [data-filter="all"]');
await page.click(".inbox [data-readall]");
if (await page.locator(".inbox .msg.unread").count()) fail("mark all read left unread memos");
await page.waitForTimeout(1700);
if (await page.locator('.ic[data-open="inbox"] .badge').count()) fail("badge still shown after mark all read");
await page.screenshot({ path: "shots/inbox-2-filtered.png" });

// Guide tab through Start > Help.
await page.click(".start");
await page.click('.startmenu button:has-text("Help")');
await page.waitForSelector(".loop-strip");
if (!(await page.locator('.hb-pane[data-pane="guide"]').isVisible())) fail("Help did not open the Guide tab");
await page.screenshot({ path: "shots/inbox-3-guide.png" });
await page.click('[data-hbtab="settings"]');
if (!(await page.locator('[data-opt="streamer"]').isVisible())) fail("settings tab missing");

// Index filter and the Heat note.
await page.click('.ic[data-open="index"]');
await page.click('.index [data-tab="level"]');
await page.click('.index [data-filter="found"]');
if (!(await page.locator(".index .card").count())) fail("index filter shows nothing");

// Close the books: the day card.
await page.evaluate(() => { document.querySelector('.ic[data-open="ledger"]').click(); });
await page.waitForSelector("[data-endday]");
await page.click("[data-endday]");
await page.locator(".dialog .btn", { hasText: "Close anyway" }).click({ timeout: 1500 }).catch(() => {});
await page.waitForSelector(".daycard");
const card = (await page.locator(".daycard").textContent()) ?? "";
if (!/Earned/.test(card) || !/Tomorrow/.test(card)) fail("day card is missing its parts");
await page.screenshot({ path: "shots/inbox-4-daycard.png" });
await page.click("[data-dc-ok]");
if (await page.locator(".daycard").count()) fail("day card did not close");
await page.close();

// --- Phone ---
page = await open({ width: 390, height: 844 }, "phone");
await page.click('.ic[data-open="inbox"]');
await page.waitForSelector(".inbox .msg");
await page.screenshot({ path: "shots/inbox-5-phone.png" });
await page.click('.ic[data-open="handbook"]').catch(() => {});
await page.close();

await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("inbox ok");
