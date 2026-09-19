/** Живые подсказки на телефоне: через сколько видно варианты при наборе. */
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (512 * 1024) / 8,
  });
  await p.goto("https://sapkeflykino.ru/search", { waitUntil: "domcontentloaded", timeout: 120000 });
  const поле = p.locator('input[aria-label="Поиск"]');
  await поле.waitFor({ timeout: 60000 });
  await p.waitForTimeout(3000);
  await поле.click();
  const t = Date.now();
  await поле.type("оппенг", { delay: 70 });
  await p.waitForSelector('a[href^="/movie/"], a[href^="/tv/"]', { timeout: 30000 }).catch(() => console.log("подсказок нет"));
  console.log("подсказки появились через " + ((Date.now() - t) / 1000).toFixed(1) + " с от начала набора");
  const список = await p.evaluate(() => [...document.querySelectorAll('a[href^="/movie/"], a[href^="/tv/"]')]
    .slice(0, 4).map((a) => a.innerText.replace(/\s+/g, " ").trim().slice(0, 40)));
  console.log("варианты: " + JSON.stringify(список));
  // Повторный набор того же — должен быть из кэша
  await поле.fill("");
  await p.waitForTimeout(800);
  const t2 = Date.now();
  await поле.type("оппенг", { delay: 70 });
  await p.waitForSelector('a[href^="/movie/"], a[href^="/tv/"]', { timeout: 30000 }).catch(() => {});
  console.log("повторно (из кэша): " + ((Date.now() - t2) / 1000).toFixed(1) + " с");
  await p.screenshot({ path: process.env.DIR + "/suggest.png" });
  await b.close();
})();
