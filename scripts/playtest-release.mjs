// Release checks: a broken or newer save is set aside (not overwritten) with a
// notice, and the Handbook shows the version.
import { chromium } from "playwright-core";
import { createServer } from "vite";

const server = await createServer({ server: { port: 5212 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
let failed = false;

for (const [label, text, expect] of [
  ["broken", "{broken", "could not be read"],
  ["newer", JSON.stringify({ version: 999, company: "Future Co" }), "newer version"],
]) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5212/?fast");
  await page.evaluate((t) => localStorage.setItem("out-of-office.save", t), text);
  await page.goto("http://localhost:5212/?fast");
  await page.waitForSelector("#ob-name, #desk .ic");
  if (await page.locator("#ob-name").count()) {
    await page.fill("#ob-name", "Amos");
    await page.click("[data-sign]");
  }
  await page.waitForSelector(".dlg", { timeout: 8000 });
  const msg = (await page.locator(".dlg p").first().textContent()) ?? "";
  const backup = await page.evaluate(() => localStorage.getItem("out-of-office.save.backup"));
  const ok = msg.includes(expect) && backup === text;
  console.log(`${label} save: notice ${msg.includes(expect) ? "shown" : "MISSING"}, backup ${backup === text ? "kept" : "MISSING"}`);
  if (!ok) failed = true;
  if (label === "newer") {
    await page.click('[data-open="handbook"]');
    const v = await page.locator(".handbook").last().innerText();
    console.log("version shown:", /1\.0\.0-rc\.1/.test(v));
    if (!/1\.0\.0-rc\.1/.test(v)) failed = true;
  }
  await ctx.close();
}

console.log("errors:", errors.length ? errors.join(" | ") : "none");
await browser.close();
await server.close();
if (errors.length || failed) process.exit(1);
