// Headless play-test: boots the game, signs the onboarding form, then works the
// window manager (drag, resize, minimize, maximize, Start menu, dialogs) and
// saves screenshots to shots/. Fails on any page error or broken expectation.
import { chromium } from "playwright-core";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";

mkdirSync("shots", { recursive: true });
const server = await createServer({ server: { port: 5199 }, logLevel: "error" });
await server.listen();
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const errors = [];
const expect = (ok, what) => {
  if (!ok) errors.push(`expected: ${what}`);
};

for (const [name, viewport] of [["desktop", { width: 1280, height: 800 }], ["phone", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5199/?seed=7&fast");

  // Onboarding: signing is disabled until there is a name.
  await page.waitForSelector(".onboard");
  expect(await page.locator("[data-sign]").isDisabled(), "sign button starts disabled");
  await page.fill("#ob-name", "Amos");
  await page.click(".chip >> nth=1");
  await page.click("[data-reroll]");
  await page.screenshot({ path: `shots/${name}-onboarding.png` });
  await page.click("[data-sign]");
  await page.waitForSelector(".win[data-app='inbox']");
  await page.waitForSelector(".boot", { state: "detached" });
  expect((await page.locator(".memo").innerText()).includes("Amos"), "welcome memo uses the typed name");

  if (viewport.width < 640) {
    // On a phone the first-boot windows cover the icons; close them like a player would.
    while (await page.locator(".win").count()) await page.locator(".win.active [data-act=close]").click();
  }

  // Drag and resize a window.
  await page.click('[data-open="hr"]');
  const win = page.locator('.win[data-app="hr"]');
  const tb = await win.locator(".tb").boundingBox();
  await page.mouse.move(tb.x + 40, tb.y + 10);
  await page.mouse.down();
  await page.mouse.move(tb.x + 100, tb.y + 120, { steps: 5 });
  await page.mouse.up();
  const moved = await win.boundingBox();
  expect(Math.abs(moved.y - (tb.y + 110)) < 4, "window follows the drag");
  if (viewport.width >= 640) {
    const grip = await win.locator(".grip").boundingBox();
    await page.mouse.move(grip.x + 7, grip.y + 7);
    await page.mouse.down();
    await page.mouse.move(grip.x + 87, grip.y + 47, { steps: 4 });
    await page.mouse.up();
    expect((await win.boundingBox()).width > moved.width + 70, "grip resizes the window");
  }

  // Minimize to the taskbar and back.
  await win.locator("[data-act=min]").click();
  expect(await win.isHidden(), "minimize hides the window");
  await page.click('[data-task="hr"]');
  expect(await win.isVisible(), "taskbar button restores it");

  // Maximize fills the work area; restore puts it back.
  await win.locator("[data-act=max]").click();
  const max = await win.boundingBox();
  expect(max.width >= viewport.width - 2 && max.y <= 1, "maximize fills the screen");
  await page.screenshot({ path: `shots/${name}-maximized.png` });
  await win.locator(".tb").dblclick();
  expect((await win.boundingBox()).width < viewport.width - 10 || viewport.width < 640, "double-click restores");

  // Start menu and the Clock Out dialog.
  await page.click(".start");
  await page.screenshot({ path: `shots/${name}-start.png` });
  await page.click(".startmenu >> text=Clock Out...");
  await page.waitForSelector(".win.dialog");
  await page.screenshot({ path: `shots/${name}-dialog.png` });
  await page.click(".win.dialog >> text=OK");
  await page.click(".win.dialog >> text=OK");
  expect((await page.locator(".win.dialog").count()) === 0, "dialogs close");

  // Something changes while you look away.
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  expect((await page.locator('[data-open="lab"] span').innerText()) === "Lab (2)", "a label changed while away");

  await page.screenshot({ path: `shots/${name}.png` });
  console.log(name, "ok, windows open:", await page.locator(".win").count());
  await page.close();
}

// Returning player: the save remembers the boss, so the boot shows the time clock.
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5199/?seed=3&fast");
  await page.fill("#ob-name", "Amos");
  await page.click("[data-sign]");
  await page.waitForSelector(".win");
  await page.goto("http://localhost:5199/?fast");
  await page.waitForSelector("[data-clockin]");
  expect((await page.locator(".welcome").innerText()).includes("Amos"), "returning boot greets the boss");
  await page.screenshot({ path: "shots/returning.png" });
  await page.click("[data-clockin]");
  // Infected preview: the lights stutter often and icons drift further.
  await page.goto("http://localhost:5199/?fast&unease=1");
  await page.click("[data-clockin]");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "shots/infected.png" });
  await ctx.close();
}

await browser.close();
await server.close();
if (errors.length) {
  console.error("Play-test failed:\n" + errors.join("\n"));
  process.exit(1);
}
console.log("play-test passed");
