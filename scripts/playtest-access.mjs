// Play-test for access and phones: relaxed timers and pause, the Accessibility
// section, tap targets and the Feeds Wall on a phone, the orientation chip, the
// Start menu keys, the clip toast, set-aside saves and a second tab.
// Screenshots: shots/access-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const PORT = 5324;
const server = await createServer({ server: { port: PORT }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  args: ["--use-fake-ui-for-media-stream"],
});
const errors = [];
const fail = (m) => { errors.push(m); console.log("FAIL", m); };
const ok = (c, m) => { if (!c) fail(m); };

const { newGame } = await server.ssrLoadModule("/src/sim/state.ts");
const { hire } = await server.ssrLoadModule("/src/sim/crew.ts");
const x = await server.ssrLoadModule("/src/sim/expedition.ts");

function stage({ runs = 0, tutorial = 4, threat = false, call = false } = {}) {
  const s = newGame(41, "Amos");
  s.catchphrase = "Rise and grind";
  s.tutorial = tutorial;
  s.cash = 20000;
  s.upgrades.dispatch = 2;
  for (const w of s.pool.slice(0, 5)) { s.cash += w.cost; hire(s, w.id); }
  for (let i = 0; i < runs; i++) {
    const c = s.crew[i];
    const exp = x.startExpedition(s, [c.id], [{ x: 20 + i * 2, y: 5 + i * 3 }]);
    exp.callsMade = 99;
    exp.entities = [];
    for (let k = 0; k < 10; k++) x.stepExpedition(s, exp);
  }
  const first = s.expeditions[0];
  if (first && threat) first.threat = { id: "smiler", asked: first.tick };
  if (first && call) first.call = { id: "door", asked: first.tick, m: first.crewIds[0] };
  return JSON.stringify(s);
}

async function open(save, ctxOptions = { viewport: { width: 1280, height: 720 } }, { query = "", settings, hidden = false } = {}) {
  const ctx = await browser.newContext(ctxOptions);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push("page " + e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
  if (hidden) await page.addInitScript(() => Object.defineProperty(document, "hidden", { value: true, configurable: true }));
  await page.addInitScript(([r, a]) => {
    if (sessionStorage.seeded) return;
    sessionStorage.seeded = "1";
    if (r) localStorage.setItem("out-of-office.save", r);
    if (a) localStorage.setItem("out-of-office.access", a);
  }, [save, settings ? JSON.stringify(settings) : null]);
  await page.goto(`http://localhost:${PORT}/${query}`);
  await page.waitForSelector("[data-clockin], #desk .ic, #ob-name");
  if (await page.locator("#ob-name").count()) {
    await page.fill("#ob-name", "Amos");
    await page.click("[data-sign]");
  }
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  return { ctx, page };
}
const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
const tick = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.save")).expeditions[0].tick);

// --- Relaxed timers and pause (fast ticks, 40 ms) ---------------------------
{
  const t = async (settings, hide = false) => {
    const { ctx, page } = await open(stage({ runs: 1, threat: true }), undefined, { query: "?fast", settings, hidden: hide });
    const a = await page.evaluate(() => document.querySelector("#desk") && true);
    await page.waitForTimeout(1500);
    const exp = await page.evaluate(() => { const s = JSON.parse(localStorage.getItem("out-of-office.save")); return s.expeditions[0]; });
    const banner = await page.locator(".pausebar:not([hidden])").count();
    await ctx.close();
    return { threat: !!exp.threat, tick: exp.tick, banner, a };
  };
  const base = await t({});
  console.log("default, threat 1.5 s:", JSON.stringify(base));
  ok(!base.threat, "default: threat should have resolved by itself");
  const wait = await t({ relaxed: "wait" });
  console.log("wait:", JSON.stringify(wait));
  ok(wait.threat, "wait mode: threat should still be waiting for the answer");
  const x3 = await t({ relaxed: "x3" });
  console.log("x3:", JSON.stringify(x3));
  const hid = await t({ pauseHidden: true }, true);
  console.log("hidden tab:", JSON.stringify(hid));
  ok(hid.threat && hid.banner === 1, "hidden tab: the run should hold and show the Paused banner");
  const hidOff = await t({ pauseHidden: false }, true);
  ok(!hidOff.threat, "pauseHidden off: the run should go on in a hidden tab");
}

// --- Handbook Accessibility section, scale, contrast ------------------------
{
  const { ctx, page } = await open(stage({ runs: 2 }));
  await page.click('[data-open="handbook"]');
  const hb = page.locator('.win[data-app="handbook"]');
  ok(await hb.locator("h4", { hasText: "Accessibility" }).count(), "handbook has no Accessibility section");
  await page.screenshot({ path: "shots/access-1-handbook.png" });
  await hb.locator('select[data-acc="scale"]').selectOption("150");
  await hb.locator('input[data-acc="contrast"]').check();
  await hb.locator('select[data-acc="relaxed"]').selectOption("wait");
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("out-of-office.access")));
  console.log("saved settings:", JSON.stringify(saved));
  ok(saved.scale === 150 && saved.contrast && saved.relaxed === "wait", "settings were not stored");
  const z = await page.evaluate(() => ({ scale: document.documentElement.dataset.scale, contrast: document.documentElement.dataset.contrast, desk: document.getElementById("desk").getBoundingClientRect().toJSON(), tb: document.querySelector(".taskbar").getBoundingClientRect().toJSON() }));
  console.log("150% desk:", JSON.stringify(z));
  ok(Math.abs(z.desk.width - 1280) < 2 && Math.abs(z.tb.bottom - 720) < 2, "scaled desktop does not fill the window");
  await page.screenshot({ path: "shots/access-2-scale150-contrast.png" });
  await page.reload();
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  ok((await page.evaluate(() => document.documentElement.dataset.scale)) === "150", "scale not remembered after reload");
  // Dragging a window by 100 screen pixels moves it 100 screen pixels at 150% too.
  const tb = await page.locator(".win.active .tb").boundingBox();
  const l0 = await page.locator(".win.active").evaluate((e) => e.getBoundingClientRect().left);
  await page.mouse.move(tb.x + 100, tb.y + 10);
  await page.mouse.down();
  await page.mouse.move(tb.x + 50, tb.y + 10, { steps: 4 });
  await page.mouse.up();
  const l1 = await page.locator(".win.active").evaluate((e) => e.getBoundingClientRect().left);
  console.log("drag at 150%: moved", Math.round(l1 - l0), "px for 50 screen px");
  ok(Math.abs(l1 - l0 + 50) < 3, "window drag does not follow the pointer at 150%");
  await page.screenshot({ path: "shots/access-2b-scale150-dragged.png" });
  await ctx.close();
}

// --- Reduce motion follows the system setting and hides the flicker layers --
{
  const { ctx, page } = await open(stage({ runs: 0 }), { viewport: { width: 1280, height: 720 }, reducedMotion: "reduce" });
  const m = await page.evaluate(() => ({ motion: document.documentElement.dataset.motion, veil: getComputedStyle(document.querySelector(".veil")).display }));
  console.log("prefers-reduced-motion:", JSON.stringify(m));
  ok(m.motion === "reduced" && m.veil === "none", "reduced motion is not applied from the system setting");
  await ctx.close();
}

// --- Desktop 1280x720: windows fit, orientation bar, Start menu -------------
{
  const { ctx, page } = await open(stage({ runs: 2 }), undefined, {});
  for (const id of ["ledger", "facilities", "hr"]) await page.click(`[data-open="${id}"]`);
  const fit = await page.evaluate(() => [...document.querySelectorAll(".win")].map((w) => { const r = w.getBoundingClientRect(); return { app: w.dataset.app, bottom: Math.round(r.bottom), top: Math.round(r.top) }; }));
  const work = await page.evaluate(() => document.querySelector(".work").getBoundingClientRect().bottom);
  console.log("window bottoms vs work", work, JSON.stringify(fit));
  ok(fit.every((w) => w.bottom <= work + 1), "a window hangs below the work area");
  await page.screenshot({ path: "shots/access-3-desktop-1280.png" });
  // Start menu
  const start = page.locator(".taskbar .start");
  await start.click();
  ok((await page.locator('.startmenu .items[role="menu"] [role="menuitem"]').count()) > 5, "start menu has no menuitems");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  const focused = await page.evaluate(() => document.activeElement?.getAttribute("role"));
  console.log("focus after arrows:", focused);
  await page.keyboard.press("Escape");
  ok(await page.locator(".startmenu[hidden]").count(), "Escape did not close the Start menu");
  ok((await page.locator(".win").count()) === 5, "Escape closed a window as well as the menu");
  await start.click();
  await page.mouse.click(700, 300);
  ok(await page.locator(".startmenu[hidden]").count(), "outside click did not close the Start menu");
  await start.click();
  await page.setViewportSize({ width: 900, height: 600 });
  await page.waitForTimeout(200);
  ok(await page.locator(".startmenu[hidden]").count(), "resize did not close the Start menu");
  await ctx.close();
}

// --- Orientation bar never covers Send --------------------------------------
for (const [name, opts] of [["desktop", { viewport: { width: 1280, height: 720 } }], ["phone", { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }]]) {
  const { ctx, page } = await open(stage({ tutorial: 1 }), opts);
  await page.waitForSelector(".tutorial:not([hidden])");
  const tut = await rect(page, ".tutorial");
  console.log(name, "orientation bar:", JSON.stringify(tut));
  await page.click('[data-open="map"]');
  await page.waitForTimeout(400);
  const send = page.locator("[data-send]");
  await send.scrollIntoViewIfNeeded().catch(() => {});
  const s = await rect(page, "[data-send]");
  const overlap = !(s.y + s.h <= tut.y || s.y >= tut.y + tut.h);
  console.log(name, "send:", JSON.stringify(s));
  ok(!overlap, `${name}: the orientation bar covers Send`);
  ok(tut.h <= (name === "phone" ? 46 : 28), `${name}: orientation bar is ${tut.h}px tall`);
  await page.screenshot({ path: `shots/access-4-orient-${name}.png` });
  await ctx.close();
}

// --- Keyboard pins on the map ---------------------------------------------
{
  const { ctx, page } = await open(stage({ runs: 0 }));
  await page.click('[data-open="map"]');
  await page.locator("canvas.map").focus();
  for (const k of ["ArrowRight", "ArrowRight", "Enter", "ArrowDown", "Enter"]) await page.keyboard.press(k);
  const txt = await page.locator('.win[data-app="map"]').textContent();
  console.log("pins by keyboard:", /2 of 5 pins/.test(txt));
  ok(/2 of 5 pins/.test(txt), "arrows + Enter did not place two pins");
  await page.keyboard.press("Enter");
  ok(/1 of 5 pins/.test(await page.locator('.win[data-app="map"]').textContent()), "Enter on a pin did not lift it");
  await page.screenshot({ path: "shots/access-4b-keyboard-pins.png" });
  await ctx.close();
}

// --- Phone: tap targets, tray, icons, feeds, inbox --------------------------
{
  const { ctx, page } = await open(stage({ runs: 3, call: true }), { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await page.screenshot({ path: "shots/access-5-phone-desktop.png" });
  const icons = await page.evaluate(() => [...document.querySelectorAll(".icons .ic")].map((e) => { const r = e.getBoundingClientRect(); return { id: e.dataset.open, right: Math.round(r.right), bottom: Math.round(r.bottom) }; }));
  ok(icons.every((i) => i.right <= 390 && i.bottom <= 844 - 48), "an icon is off screen: " + JSON.stringify(icons.filter((i) => i.right > 390 || i.bottom > 796)));
  ok(icons.some((i) => i.id === "handbook"), "no Handbook icon");
  const tray = await page.evaluate(() => [...document.querySelectorAll(".tray b, .tray button")].filter((e) => e.offsetParent).map((e) => e.textContent.trim()));
  console.log("phone tray:", JSON.stringify(tray));
  ok(tray.some((t) => t.startsWith("$")), "cash is not in the phone tray");
  const sizes = {};
  sizes.start = await rect(page, ".taskbar .start");
  sizes.hum = await rect(page, ".tray [data-hum]");
  await page.click('[data-open="feeds"]');
  await page.waitForTimeout(600);
  sizes.close = await rect(page, '.win[data-app="feeds"] .tb [data-act="close"]');
  sizes.min = await rect(page, '.win[data-app="feeds"] .tb [data-act="min"]');
  sizes.max = await rect(page, '.win[data-app="feeds"] .tb [data-act="max"]');
  sizes.task = await rect(page, ".taskbar .tasks .btn");
  for (const [k, r] of Object.entries(sizes)) {
    console.log("tap target", k, Math.round(r.w), "x", Math.round(r.h));
    ok(r.w >= 43.5 && r.h >= 43.5, `tap target ${k} is ${Math.round(r.w)}x${Math.round(r.h)}`);
  }
  const tiles = await page.evaluate(() => [...document.querySelectorAll(".feeds .tile")].map((t) => { const r = t.getBoundingClientRect(); const c = t.querySelector("canvas").getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), ratio: +(c.width / c.height).toFixed(2), x: Math.round(r.x) }; }));
  console.log("phone tiles:", JSON.stringify(tiles));
  ok(tiles.length === 3 && tiles.every((t) => t.x === tiles[0].x), "feeds wall is not one column");
  ok(tiles.every((t) => Math.abs(t.ratio - 1.6) < 0.05), "tiles are not 16:10");
  await page.screenshot({ path: "shots/access-6-phone-feeds.png" });
  // focused feed has a clip button
  await page.locator(".feeds .tile.alert").tap();
  await page.waitForTimeout(500);
  ok(await page.locator(".feeds [data-clip]").count(), "focused feed has no clip button");
  await page.screenshot({ path: "shots/access-7-phone-focus.png" });
  await page.evaluate(() => document.querySelector('.win[data-app="feeds"] [data-act="close"]').click());
  await page.click('[data-open="inbox"]');
  await page.waitForTimeout(300);
  const list = await rect(page, ".inbox .list");
  console.log("inbox list height:", Math.round(list.h));
  ok(list.h > 200 || (await page.locator(".inbox .msg").count()) < 4, "inbox list is short on the phone");
  await page.screenshot({ path: "shots/access-8-phone-inbox.png" });
  await ctx.close();
}

// --- Desktop 1280x720 Feeds Wall focus + clip toast --------------------------
{
  const { ctx, page } = await open(stage({ runs: 3, call: true }));
  await page.click('[data-open="feeds"]');
  await page.waitForTimeout(500);
  await page.locator(".feeds .tile.alert").click();
  await page.waitForTimeout(600);
  const supported = await page.locator(".feeds [data-clip]:not([hidden])").count();
  if (!supported) console.log("clip button hidden here (no MediaRecorder); skipping the toast check");
  else {
    await page.waitForTimeout(2500);
    const label = await page.locator(".feeds [data-clip]").textContent();
    console.log("clip label:", label);
    ok(/^Clip the last \d+ s$/.test(label), "clip label does not state the length: " + label);
    await page.locator(".feeds [data-clip]").click();
    await page.waitForSelector(".toast", { timeout: 4000 }).catch(() => fail("no clip toast"));
    const toast = await page.locator(".toast").first().textContent().catch(() => "");
    console.log("toast:", toast);
    ok(/Saved bodycam-\d{6}\.webm \(about \d+ s\)/.test(toast), "toast text: " + toast);
  }
  await page.screenshot({ path: "shots/access-9-feeds-focus-1280.png" });
  await ctx.close();
}

// --- A save that could not be read ------------------------------------------
{
  const { ctx, page } = await open("{not json", undefined, {});
  const dlg = page.locator(".win.dialog");
  await dlg.first().waitFor({ timeout: 8000 }).catch(() => {});
  const text = await dlg.first().textContent().catch(() => "");
  console.log("set-aside notice:", text.slice(0, 120));
  ok(/set aside/.test(text) && /Export old save/.test(text), "no set-aside notice with an Export button");
  const dl = page.waitForEvent("download", { timeout: 4000 }).catch(() => null);
  await dlg.first().locator("button", { hasText: "Export old save" }).click();
  const d = await dl;
  ok(d && d.suggestedFilename().includes("set-aside"), "export button did not download the old save");
  await ctx.close();
}

// --- A second tab on the same save -------------------------------------------
{
  const { ctx, page } = await open(stage({ runs: 0 }));
  const two = await ctx.newPage();
  await two.goto(`http://localhost:${PORT}/`);
  await two.waitForSelector("[data-clockin], #desk .ic");
  if (await two.locator("[data-clockin]").count()) await two.click("[data-clockin]");
  await two.waitForSelector("#desk .ic");
  await page.bringToFront();
  await page.locator(".win.dialog", { hasText: "another tab" }).waitFor({ timeout: 5000 }).catch(() => fail("no second-tab warning"));
  await page.screenshot({ path: "shots/access-10-two-tabs.png" });
  await ctx.close();
}

await browser.close();
await server.close();
if (errors.length) { console.log(errors.join("\n")); process.exit(1); }
console.log("access ok");
