/** Путь через меню MSX: «СМОТРЕТЬ» → «Запустить приложение» → обёртка. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto("https://msx.benzac.de/?start=menu:https://sapkeflykino.ru/msx/menu.json", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(11000);
  console.log("меню: " + (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 100));
  await page.keyboard.press("Enter"); await page.waitForTimeout(3500);
  await page.keyboard.press("Enter"); await page.waitForTimeout(12000);
  const b = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const opened = ctx.pages().find((p) => p.url().includes("/tvweb/"));
  console.log("подтверждение: " + (/Link Validation|press continue/i.test(b) ? "ДА" : "нет"));
  console.log("обёртка: " + (opened ? "ОТКРЫЛАСЬ" : "не открылась"));
  if (opened) { await opened.waitForTimeout(10000);
    const t = (await opened.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    console.log("экран: " + t.slice(0, 120)); }
  await browser.close();
})();
