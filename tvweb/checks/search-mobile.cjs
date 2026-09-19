/** Поиск на телефоне: сколько ждёт человек от нажатия до результатов. */
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  // 4G: 4 Мбит/с вниз, задержка 120 мс — обычный телефон, не идеальный wifi.
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 120, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8,
  });
  const t0 = Date.now();
  await p.goto("https://sapkeflykino.ru/", { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("главная открылась: " + ((Date.now() - t0) / 1000).toFixed(1) + " с");
  await p.waitForTimeout(4000);
  // Кнопка «Поиск» в нижней панели
  const кнопка = p.locator('nav.mobile-bottom-nav a[href="/search"]').first();
  const t1 = Date.now();
  await кнопка.click();
  await p.waitForSelector('input[aria-label="Поиск"]', { timeout: 60000 });
  console.log("страница поиска открылась: " + ((Date.now() - t1) / 1000).toFixed(1) + " с");
  await p.fill('input[aria-label="Поиск"]', "матрица");
  const t2 = Date.now();
  await p.keyboard.press("Enter");
  // ждём карточки результатов
  await p.waitForFunction(() => /Матрица/i.test(document.body.innerText) && document.querySelectorAll("img").length > 3, null, { timeout: 90000 })
    .catch(() => console.log("результаты не дождались за 90 с"));
  console.log("РЕЗУЛЬТАТЫ ПОЯВИЛИСЬ: " + ((Date.now() - t2) / 1000).toFixed(1) + " с после Enter");
  // что было на экране сразу после Enter
  console.log("всего запросов страницы: " + (await p.evaluate(() => performance.getEntriesByType("resource").length)));
  await p.screenshot({ path: process.env.DIR + "/search-mobile.png" });
  await b.close();
})();
