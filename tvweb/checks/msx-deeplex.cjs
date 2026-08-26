/** Схема Деплекса: стартовый параметр должен САМ открыть обёртку внутри MSX. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto("https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/start.json", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(14000);
  const b = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const pages = ctx.pages();
  const inSame = page.url().includes("/tvweb/");
  const inNew = pages.find((p) => p !== page && p.url().includes("/tvweb/"));
  console.log("подтверждение: " + (/Link Validation|press continue/i.test(b) ? "ДА" : "нет"));
  console.log("вкладок: " + pages.length);
  console.log("обёртка в ТОЙ ЖЕ вкладке (внутри MSX): " + (inSame ? "ДА" : "нет"));
  console.log("обёртка в НОВОЙ вкладке (браузер): " + (inNew ? "ДА" : "нет"));
  console.log("адрес: " + page.url());
  console.log("экран: " + b.slice(0, 130));
  await browser.close();
})();
