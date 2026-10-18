// Playtester tour: records video and screenshots of a fresh first session at real
// speed, then a tour of every app in a mid game and a late game, plus a phone view.
// Output: shots/tour/*.png, shots/tour/*.webm and shots/tour/log.json (timestamps).
//   node scripts/playtest-tour.mjs
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT = "shots/tour";
mkdirSync(OUT, { recursive: true });
const server = await createServer({ server: { port: 5219 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const BASE = "http://localhost:5219/";
const log = [];
const errors = [];
const SIZE = { width: 1280, height: 720 };

async function ctx(name, opts = {}) {
  // Playwright's own recorder needs a ffmpeg build this box doesn't have, so frames
  // are grabbed in a loop and stitched with the system ffmpeg.
  const context = await browser.newContext({ viewport: SIZE, ...opts });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`${name}: ${e.message}`));
  const dir = `${OUT}/frames-${name}`;
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const c = { context, page, t0: Date.now(), name, dir, frames: 0, on: true };
  c.loop = (async () => {
    while (c.on) {
      await page.screenshot({ path: `${dir}/f${String(c.frames++).padStart(5, "0")}.jpg`, type: "jpeg", quality: 55 }).catch(() => {});
    }
  })();
  return c;
}
const mark = async (c, file, note) => {
  const t = Math.round((Date.now() - c.t0) / 100) / 10;
  await c.page.screenshot({ path: `${OUT}/${file}.png` });
  log.push({ clip: c.name, file, t, note });
  console.log(`[${c.name} ${t}s] ${file}: ${note}`);
};
const finish = async (c) => {
  c.on = false;
  await c.loop;
  const secs = (Date.now() - c.t0) / 1000;
  await c.context.close();
  const fps = Math.max(1, c.frames / secs).toFixed(2);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", fps, "-i", `${c.dir}/f%05d.jpg`, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "30", "-movflags", "+faststart", `${OUT}/${c.name}.mp4`]);
  rmSync(c.dir, { recursive: true, force: true });
  log.push({ clip: c.name, file: `${c.name}.mp4`, t: Math.round(secs), note: `video, ${c.frames} frames at ${fps} fps` });
};
const load = async (c, saveFile, query = "fast") => {
  const raw = readFileSync(saveFile, "utf8");
  // Seed storage before any game code runs, so the page cannot save over it.
  await c.page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, raw);
  await c.page.goto(`${BASE}?${query}`);
  await c.page.waitForSelector("[data-clockin], #desk .ic", { timeout: 90000 });
  if (await c.page.locator("[data-clockin]").count()) await c.page.click("[data-clockin]");
  await c.page.waitForSelector("#desk .ic");
};

// ---------- Clip 1: a fresh first session at real speed (no ?fast)
{
  const c = await ctx("first-session");
  const { page } = c;
  await page.goto(`${BASE}?seed=11`);
  await page.waitForTimeout(1200);
  await mark(c, "01-boot", "First screen");
  await page.waitForSelector("#ob-name, #desk .ic", { timeout: 60000 });
  await mark(c, "02-onboarding", "Onboarding form");
  if (await page.locator("#ob-name").count()) {
    await page.fill("#ob-name", "Amos");
    await page.click("[data-sign]");
  }
  await page.waitForSelector("#desk .ic", { timeout: 60000 });
  await page.waitForTimeout(1500);
  await mark(c, "03-desktop", "First desktop with orientation card");
  await page.click('[data-open="hr"]');
  await page.waitForTimeout(800);
  await mark(c, "04-hr-empty", "HR Roster before hiring");
  for (let i = 0; i < 2; i++) { await page.locator("[data-hire]:not([disabled])").first().click(); await page.waitForTimeout(500); }
  await mark(c, "05-hired", "Two hires");
  await page.click('[data-open="map"]');
  const map = page.locator('.win[data-app="map"]');
  await page.waitForTimeout(600);
  await mark(c, "06-map-plan", "Facility Map, planning");
  for (const box of await map.locator("input[data-pick]").all()) await box.check();
  const cb = await map.locator("canvas.map").boundingBox();
  await map.locator("canvas.map").click({ position: { x: cb.width * 0.8, y: cb.height * 0.45 } });
  await map.locator("[data-send]").click();
  const sentAt = Date.now();
  await page.waitForTimeout(2500);
  await mark(c, "07-run-start", "Run starts: body cam and radio");
  let answered = 0;
  let shots = 0;
  while (!(await map.locator(".debrief").count()) && Date.now() - sentAt < 120000) {
    await page.waitForTimeout(700);
    if (await map.locator("[data-answer]").count()) {
      if (!answered) await mark(c, "08-call", "A radio call asks for a decision");
      await page.waitForTimeout(2500);
      await map.locator('[data-answer="0"]').first().click().catch(() => {});
      answered++;
    }
    if ((Date.now() - sentAt) / 1000 > 10 + shots * 12 && shots < 3) { shots++; await mark(c, `09-run-wait-${shots}`, `Waiting during the run at ${Math.round((Date.now() - sentAt) / 1000)}s`); }
  }
  const runSecs = Math.round((Date.now() - sentAt) / 100) / 10;
  log.push({ clip: c.name, file: "run-length", t: runSecs, note: `The first run took ${runSecs}s real time, calls answered: ${answered}` });
  await mark(c, "10-debrief", "Debrief after the first run");
  await page.click('[data-open="ledger"]');
  await page.waitForTimeout(500);
  await mark(c, "11-ledger", "Ledger with first loot");
  for (const b of await page.locator('.win[data-app="ledger"] [data-sell]').all()) await b.click().catch(() => {});
  await page.waitForTimeout(400);
  await mark(c, "12-sold", "After selling");
  await page.locator('.win[data-app="ledger"] [data-endday]').click();
  if (await page.locator(".dialog .btn", { hasText: "Close anyway" }).count()) await page.locator(".dialog .btn", { hasText: "Close anyway" }).click(); // pre-close checklist
  await page.waitForTimeout(1500);
  await mark(c, "13-day2", "Day 2 begins");
  await finish(c);
}

// ---------- Clip 2: one run of a mid game at real speed
await (async () => {
  const c = await ctx("midgame-run");
  const { page } = c;
  await load(c, "shots/save-d12.json", "");
  await page.click('[data-open="map"]');
  const map = page.locator('.win[data-app="map"]');
  await page.waitForTimeout(500);
  const idleCount = await map.locator("input[data-pick]").count();
  if (idleCount) {
    const boxes = await map.locator("input[data-pick]").all();
    for (const b of boxes.slice(0, 3)) await b.check().catch(() => {});
    const levels = await map.locator("[data-level]:not([disabled])").all();
    if (levels.length > 2) await levels[levels.length - 1].click();
    await page.waitForTimeout(300);
    const cb = await map.locator("canvas.map").boundingBox();
    for (const [fx, fy] of [[0.35, 0.5], [0.6, 0.35], [0.82, 0.55]]) await map.locator("canvas.map").click({ position: { x: cb.width * fx, y: cb.height * fy } });
    await mark(c, "20-midgame-plan", "Planning a deeper run with three pins");
    await map.locator("[data-send]").click().catch(() => {});
    const t = Date.now();
    while (!(await map.locator(".debrief").count()) && Date.now() - t < 70000) {
      await page.waitForTimeout(900);
      if (await map.locator("[data-answer]").count()) { await page.waitForTimeout(2500); await map.locator('[data-answer="0"]').first().click().catch(() => {}); }
    }
    await mark(c, "21-midgame-end", "End of the run");
  } else await mark(c, "20-no-idle", "Nobody idle in the saved game");
  await finish(c);
})();

// ---------- Tour: every app in the mid game
await (async () => {
  const c = await ctx("midgame-tour");
  const { page } = c;
  await load(c, "shots/save-d12.json", "fast");
  await mark(c, "30-mid-desktop", "Mid-game desktop (day 13)");
  for (const [id, label] of [["inbox", "Memo Inbox"], ["hr", "HR Roster"], ["index", "The Index"], ["ledger", "Ledger"], ["lab", "Lab"], ["facilities", "Facilities"], ["handbook", "Employee Handbook"], ["feeds", "Feeds Wall"], ["map", "Facility Map"]]) {
    await page.click(`[data-open="${id}"]`);
    await page.waitForTimeout(500);
    await mark(c, `31-app-${id}`, label);
    await page.locator(`.win[data-app="${id}"] [data-act="close"]`).click().catch(() => {});
  }
  await finish(c);
})();

// ---------- Late game, infected
await (async () => {
  const c = await ctx("late-game");
  const { page } = c;
  await load(c, "shots/save-d40.json", "fast");
  await mark(c, "40-late-desktop", "Late game (day 41), office infection 100");
  await page.waitForTimeout(3000);
  await mark(c, "41-late-desktop-later", "Same desktop a few seconds later");
  await page.click('[data-open="inbox"]');
  await page.waitForTimeout(500);
  await mark(c, "42-late-inbox", "Inbox in a late game");
  await page.click('[data-open="map"]');
  await page.waitForTimeout(500);
  await mark(c, "43-late-map", "Facility Map in a late game");
  await finish(c);
})();

// ---------- Phone
await (async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(`phone: ${e.message}`));
  const raw = readFileSync("shots/save-d12.json", "utf8");
  await page.addInitScript((r) => { if (!sessionStorage.seeded) { sessionStorage.seeded = "1"; localStorage.setItem("out-of-office.save", r); } }, raw);
  await page.goto(`${BASE}?fast`);
  await page.waitForSelector("[data-clockin], #desk .ic");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .ic");
  await page.screenshot({ path: `${OUT}/50-phone-desktop.png` });
  // The game restores open windows, which pile over the icons on a phone.
  for (let i = 0; i < 6 && (await page.locator('.win [data-act="close"]').count()); i++) await page.locator('.win [data-act="close"]').last().click();
  await page.screenshot({ path: `${OUT}/50b-phone-clear.png` });
  await page.click('[data-open="map"]');
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/51-phone-map.png` });
  log.push({ clip: "phone", file: "50-phone-desktop", t: 0, note: "Phone desktop" }, { clip: "phone", file: "51-phone-map", t: 0, note: "Phone map" });
  await context.close();
})();

writeFileSync(`${OUT}/log.json`, JSON.stringify(log, null, 2));
await browser.close();
await server.close();
console.log(errors.length ? "ERRORS\n" + errors.join("\n") : "tour ok");
console.log(readdirSync(OUT).join(" "));
