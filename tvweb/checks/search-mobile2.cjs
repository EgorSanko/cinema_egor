/** Честный замер: от Enter до карточек результатов, запрос мимо кэша. */
const { chromium, devices } = require("playwright");
const ЗАПРОС = process.env.Q || ("дюна" + Math.floor(Math.random() * 9));
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 120, downloadThroughput: (4 * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8,
  });
  await p.goto("https://sapkeflykino.ru/search", { waitUntil: "domcontentloaded", timeout: 120000 });
  await p.waitForSelector('input[aria-label="Поиск"]', { timeout: 60000 });
  await p.waitForTimeout(2500);
  await p.fill('input[aria-label="Поиск"]', ЗАПРОС);
  const t = Date.now();
  let первыйКадр = null;
  // Следим, меняется ли хоть что-то на экране сразу после Enter
  await p.evaluate(() => { window.__mut = 0; new MutationObserver(() => window.__mut++).observe(document.body, { childList: true, subtree: true }); });
  await p.keyboard.press("Enter");
  await p.waitForURL(/\/search\?q=/, { timeout: 90000 }).catch(() => {});
  const урл = ((Date.now() - t) / 1000).toFixed(1);
  await p.waitForSelector('a[href^="/movie/"], a[href^="/tv/"], a[href^="/hd/"]', { timeout: 90000 })
    .catch(() => console.log("карточек не дождались"));
  console.log("запрос: " + ЗАПРОС);
  console.log("адрес сменился: " + урл + " с | карточки: " + ((Date.now() - t) / 1000).toFixed(1) + " с");
  console.log("изменений на экране за это время: " + (await p.evaluate(() => window.__mut)));
  console.log("видно карточек: " + (await p.evaluate(() => document.querySelectorAll('a[href^="/movie/"], a[href^="/tv/"], a[href^="/hd/"]').length)));
  await p.screenshot({ path: process.env.DIR + "/search-mobile2.png" });
  await b.close();
})();
