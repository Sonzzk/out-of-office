// Play-test for the management pass: Sell all confirm/undo, facility confirm and upkeep delta,
// project cards, lab preview, training, pre-close checklist, sticky close bar, folded applicants.
// Screenshots: shots/management-*.png at 1280x720 and 390x844.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const PORT = 5321;
const server = await createServer({ server: { port: PORT }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const { endDay } = await server.ssrLoadModule("/src/sim/economy.ts");
const s = newGame(77, "Amos");
s.catchphrase = "Rise and grind";
s.tutorial = 4;
for (let i = 0; i < 3; i++) { s.cash += 600; hire(s, s.pool[0].id); }
for (let i = 0; i < 9; i++) { s.cash += 600; endDay(s); }
s.cash += 600;
hire(s, s.pool[0].id);
s.cash = 4200;
s.firstSale = true;
s.upgrades.lab = 1;
s.contracts = [
  { id: 9100, itemId: "almond-water", need: 3, reward: 540, deadline: s.day },
  { id: 9101, itemId: "wallpaper", need: 2, reward: 450, deadline: s.day + 3 },
];
const add = (itemId) => s.loot.push({ id: s.nextId++, itemId, foundBy: "Dave" });
for (const id of ["almond-water", "almond-water", "almond-water", "wallpaper", "wallpaper", "sample-hound", "sample-smiler", "candy"]) add(id);
const save = JSON.stringify(s);

for (const [name, vp, mobile] of [["desk", { width: 1280, height: 720 }, false], ["phone", { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport: vp, hasTouch: mobile });
  page.on("pageerror", (e) => errors.push("page " + e.message));
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, save);
  await page.goto(`http://localhost:${PORT}/?fast`);
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  const shot = (n) => page.screenshot({ path: `shots/management-${name}-${n}.png` });
  const open = async (app) => { await page.locator(`[data-open="${app}"]`).dispatchEvent("click"); return page.locator(`.win[data-app="${app}"]`); };
  const cash = () => page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).cash);

  // Ledger: Sell all asks first, skips contract items and samples, undo restores.
  let led = await open("ledger");
  const before = await cash();
  await led.locator("[data-sellall]").click();
  const confirm = (await led.locator(".sellconfirm").textContent()).replace(/\s+/g, " ");
  console.log(name, "confirm:", confirm);
  if (!/Keeping 5 for contracts and 2 research samples/.test(confirm)) fail(`${name}: confirm line wrong`);
  if ((await cash()) !== before) fail(`${name}: cash moved before confirm`);
  await shot("1-sellconfirm");
  await led.locator("[data-sellgo]").click();
  const left = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).loot.map((l) => l.itemId));
  if (left.length !== 7) fail(`${name}: expected 7 items left, got ${left.length}`);
  await shot("2-sold-undo");
  await led.locator("[data-undo]").click();
  if ((await cash()) !== before) fail(`${name}: undo did not restore cash`);

  // Pre-close checklist.
  await led.locator("[data-endday]").click();
  const dlg = page.locator(".dialog");
  await dlg.waitFor();
  console.log(name, "checklist:", (await dlg.locator(".dlg p").textContent()).replace(/\s+/g, " "));
  await shot("3-checklist");
  await dlg.locator(".btn", { hasText: "Go back" }).click();
  led = page.locator('.win[data-app="ledger"]');
  await led.locator(".closebar").scrollIntoViewIfNeeded();
  await shot("4-ledger-footer");
  await led.evaluate((el) => el.querySelector(".body").scrollTo(0, 400));
  await shot("5-ledger-history");

  // Facilities: confirm with upkeep and cash after.
  const fac = await open("facilities");
  const buyLabel = (await fac.locator('[data-buy="lab"]').textContent()).replace(/\s+/g, " ");
  console.log(name, "buy button:", buyLabel);
  if (!/\+\$\d+\/night/.test(buyLabel)) fail(`${name}: no upkeep delta on buy button`);
  if (!(await fac.locator('[data-buy="lab"]').isDisabled())) fail(`${name}: unaffordable buy button is enabled`);
  await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("out-of-office.save")); s.cash = 9000; localStorage.setItem("out-of-office.save", JSON.stringify(s)); });
  await page.reload();
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  const fac2 = await open("facilities");
  await fac2.locator('[data-buy="lab"]').click();
  console.log(name, "buy dialog:", (await page.locator(".dialog .dlg p").textContent()).replace(/\s+/g, " "));
  await shot("6-buy-confirm");
  await page.locator(".dialog .btn", { hasText: "Cancel" }).click();
  if ((await cash()) !== 9000) fail(`${name}: cancel still spent money`);
  await fac.locator(".body").evaluate((el) => el.scrollTo(0, el.scrollHeight));
  const projW = await fac.locator(".up.proj .txt").first().evaluate((el) => el.getBoundingClientRect().width);
  if (projW < 150) fail(`${name}: project card text only ${projW}px wide`);
  await shot("7-projects");

  // Lab: preview uses the same rule, sell price matches the Ledger.
  const lab = await open("lab");
  await lab.locator("[data-research]").first().click();
  console.log(name, "bench:", (await lab.locator(".bench").first().textContent()).replace(/\s+/g, " "));
  await shot("8-lab");

  // HR: wage on cards, folded applicants, training numbers.
  const hr = await open("hr");
  const train = (await hr.locator("[data-train]").first().textContent()).replace(/\s+/g, " ");
  console.log(name, "train:", train);
  if (!/\+\$\d+\/night/.test(train)) fail(`${name}: training button lacks wage rise`);
  if (await hr.locator(".cards").isVisible()) fail(`${name}: applicants should be folded with a crew in place`);
  await hr.locator("[data-fold]").click();
  if (!/Wage \$\d+\/night/.test(await hr.locator(".card").first().textContent())) fail(`${name}: no wage on hire card`);
  await hr.locator("[data-fold]").click();
  await shot("9-hr");
  await page.close();
}
await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("management ok");
