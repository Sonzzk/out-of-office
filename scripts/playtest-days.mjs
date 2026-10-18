// Play-test for days that differ: today's twist shows in the taskbar and Ledger, the Goals
// section lists the goal and a contract (Deliver works), and Sell all brings the buyer's call.
// Screenshots: shots/days-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5302 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { endDay } = await server.ssrLoadModule("/src/sim/economy.ts");
const s = newGame(61, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 4;
for (let i = 0; i < 4; i++) endDay(s);
s.twist = { id: "buyer", day: s.day };
s.contracts = [{ id: 9001, itemId: "polaroid", need: 2, reward: 700, deadline: s.day + 3 }];
for (let i = 0; i < 2; i++) s.loot.push({ id: 9100 + i, itemId: "polaroid", foundBy: "Test" });
for (let i = 0; i < 3; i++) s.loot.push({ id: 9110 + i, itemId: "candy", foundBy: "Test" });
const save = JSON.stringify(s);

const page = await browser.newPage({ viewport: { width: 1366, height: 860 } });
page.on("pageerror", (e) => errors.push("page " + e.message));
await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
await page.goto("http://localhost:5302/?fast");
await page.waitForSelector("[data-clockin], #desk .ic");
if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
await page.waitForSelector("#desk .ic");

if (!(await page.locator("[data-twist]").isVisible())) fail("no twist in tray");
await page.click('[data-open="ledger"]');
const led = page.locator('.win[data-app="ledger"]');
await led.locator(".twist").waitFor();
if (!(await led.locator(".twist").innerText()).includes("Collector")) fail("twist line missing");
if (!(await led.innerText()).includes("Contract:")) fail("contract not listed");
await page.screenshot({ path: "shots/days-1-ledger.png" });

await led.locator("[data-deliver]").click();
if (await led.locator("[data-deliver]").count()) fail("contract still open after deliver");
const cash = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).cash);
if (cash < 700) fail("no contract payout, cash " + cash);

await led.locator("[data-sellall]").click();
await led.locator(".buyer").waitFor();
const call = await led.locator(".buyer").innerText();
if (!call.includes("Buyer:") || !call.includes("PAID")) fail("no buyer call: " + call);
await page.screenshot({ path: "shots/days-2-buyer.png" });
await page.waitForTimeout(5200);
if (await led.locator(".buyer").count()) fail("buyer call did not fade");

// Phone width: the tray label is hidden like the others.
await page.setViewportSize({ width: 400, height: 800 });
if (await page.locator("[data-twist]").isVisible()) fail("twist tag shown on small screen");
await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("days ok");
