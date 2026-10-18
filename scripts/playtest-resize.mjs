// Windows resize from every edge, and the map explains why nobody can be picked.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5216 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:5216/?seed=7&fast");
await page.waitForSelector("#ob-name, #desk .win");
if (await page.locator("#ob-name").count()) {
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
}
await page.waitForSelector("#desk .win");
const fail = (m) => { errors.push(m); };

await page.click('[data-open="hr"]');
const win = page.locator('.win[data-app="hr"]');
const rect = () => win.evaluate((e) => ({ l: e.offsetLeft, t: e.offsetTop, w: e.offsetWidth, h: e.offsetHeight }));

async function dragEdge(edge, dx, dy) {
  const b = await win.locator(`.rz-${edge}`).boundingBox();
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2);
  await page.mouse.move(x + dx, y + dy);
  await page.mouse.up();
}

let a = await rect();
await dragEdge("e", 60, 0);
let b = await rect();
if (b.w !== a.w + 60) fail(`east: width ${a.w} -> ${b.w}`);
await dragEdge("s", 0, 40);
let c = await rect();
if (c.h !== b.h + 40) fail(`south: height ${b.h} -> ${c.h}`);
await dragEdge("w", -50, 0);
let d = await rect();
if (d.w !== c.w + 50 || d.l !== c.l - 50) fail(`west: ${JSON.stringify(c)} -> ${JSON.stringify(d)}`);
await dragEdge("n", 0, -30);
let e = await rect();
if (e.h !== d.h + 30 || e.t !== d.t - 30) fail(`north: ${JSON.stringify(d)} -> ${JSON.stringify(e)}`);
await dragEdge("nw", 20, 20);
let f = await rect();
if (f.w !== e.w - 20 || f.h !== e.h - 20) fail(`nw corner: ${JSON.stringify(e)} -> ${JSON.stringify(f)}`);
// Cannot shrink below the minimum.
await dragEdge("e", -2000, 0);
if ((await rect()).w < 220) fail("shrunk below minimum width");

// Busy crew are listed on the map with the reason.
await win.locator("[data-hire]:not([disabled])").first().click();
await win.locator('[data-job="overtime"]').first().click();
const dlg = page.locator(".win.dialog [data-ok], .win.dialog .btn").first();
if (await page.locator(".win.dialog").count()) await dlg.click();
await page.click('[data-open="map"]');
const map = page.locator('.win[data-app="map"]');
const text = await map.innerText();
if (!/Overtime Room/.test(text)) fail("map does not say why the crew is busy: " + text.slice(0, 200));
if (/Hire someone/.test(text)) fail("map still tells a player with crew to hire someone");

await browser.close();
await server.close();
if (errors.length) { console.error("FAIL\n" + errors.join("\n")); process.exit(1); }
console.log("resize playtest ok");
