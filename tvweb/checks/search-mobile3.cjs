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
  const поле = p.locator('input[aria-label="Поиск"]');
  await поле.waitFor({ timeout: 60000 });
  await p.waitForTimeout(3000);
  await поле.click();
  await поле.type(ЗАПРОС, { delay: 60 });
  await p.evaluate(() => { window.__mut = 0; new MutationObserver(() => { window.__mut++; }).observe(document.body, { childList: true, subtree: true }); });
  const t = Date.now();
  const ждёмНавигацию = p.waitForURL((u) => u.search.includes("q="), { timeout: 60000 }).then(() => ((Date.now() - t) / 1000).toFixed(1)).catch(() => "нет");
  await поле.press("Enter");
  const навигация = await ждёмНавигацию;
  await p.waitForSelector('a[href^="/movie/"], a[href^="/tv/"], a[href^="/hd/"]', { timeout: 60000 }).catch(() => {});
  console.log("запрос «" + ЗАПРОС + "»");
  console.log("адрес сменился через: " + навигация + " с");
  console.log("карточки на экране через: " + ((Date.now() - t) / 1000).toFixed(1) + " с");
  console.log("правок экрана за ожидание: " + (await p.evaluate(() => window.__mut || 0)));
  console.log("адрес: " + p.url().slice(0, 60));
  await p.screenshot({ path: process.env.DIR + "/search-mobile3.png" });
  await b.close();
})();
