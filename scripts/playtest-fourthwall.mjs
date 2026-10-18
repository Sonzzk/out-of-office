// Play-test for the fourth wall: the "Are you recording?" prompt turns on
// streamer mode (name hidden everywhere, setting remembered), and with
// Employee privacy off the office mentions the local time. Screenshots go to
// shots/fourthwall-*.png.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5208 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];

async function fresh(query, prep) {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 860 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://localhost:5208/?seed=44&fast`);
  await page.waitForSelector("#ob-name, #desk .win");
  if (await page.locator("#ob-name").count()) {
    await page.fill("#ob-name", "Amos");
    await page.click("[data-sign]");
  }
  await page.waitForSelector("#desk .win");
  await page.evaluate(prep);
  await page.goto(`http://localhost:5208/?fast&${query}`);
  await page.waitForSelector("[data-clockin], #desk .win");
  if (await page.locator("[data-clockin]").count()) await page.click("[data-clockin]");
  await page.waitForSelector("#desk .win");
  return page;
}

// 1. Stage 3: the office asks, you say yes.
let page = await fresh("stage=3", () => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.infection = 65;
  s.infectionSeen = 3;
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
});
await page.waitForSelector(".dlg", { timeout: 8000 });
await page.screenshot({ path: "shots/fourthwall-1-recording.png" });
await page.getByRole("button", { name: "Yes" }).click();
await page.waitForTimeout(400);
await page.click('[data-open="inbox"]');
const to = (await page.locator(".memo").first().textContent()) ?? "";
console.log("memo shows name:", to.includes("Amos"), "| shows alias:", to.includes("Employee"));
await page.screenshot({ path: "shots/fourthwall-2-streamer.png" });
const saved = await page.evaluate(() => localStorage.getItem("out-of-office.streamer"));
console.log("streamer saved:", saved);
await page.click('[data-open="handbook"]');
console.log("handbook streamer checked:", await page.locator('[data-opt="streamer"]').isChecked());
await page.context().close();

// 2. Privacy off: the office reads the clock.
page = await fresh("stage=2&unease=0.4", () => {
  const s = JSON.parse(localStorage.getItem("out-of-office.save"));
  s.infection = 45;
  s.infectionSeen = 2;
  localStorage.setItem("out-of-office.save", JSON.stringify(s));
  localStorage.setItem("out-of-office.privacy", "0");
});
await page.waitForSelector(".balloon, .notify, [class*=toast]", { timeout: 20000 }).catch(() => {});
const text = await page.locator("#desk").innerText();
const touched = /desk for \d+ minutes|Your clock says|You should be home/.test(text);
console.log("real-world touch shown:", touched);
await page.screenshot({ path: "shots/fourthwall-3-clock.png" });

console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || saved !== "1" || !touched || to.includes("Amos")) process.exit(1);
