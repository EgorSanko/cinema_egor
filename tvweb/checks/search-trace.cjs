/** Покадрово: что видно на экране в первые секунды после нажатия «искать». */
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
  await поле.type("оппенгеймер", { delay: 50 });
  const t = Date.now();
  await поле.press("Enter");
  const кадры = [];
  for (let i = 0; i < 40; i++) {
    const с = await p.evaluate(() => ({
      спиннер: !!document.querySelector('[aria-label="Идёт поиск"]'),
      ищем: /Ищем/.test(document.body.innerText),
      карточек: document.querySelectorAll('a[href^="/movie/"], a[href^="/tv/"], a[href^="/hd/"]').length,
      адрес: location.search.slice(0, 20),
    })).catch(() => null);
    if (с) кадры.push(((Date.now() - t) / 1000).toFixed(1) + "с сп:" + (с.спиннер ? "да" : "нет") + " ищем:" + (с.ищем ? "да" : "нет") + " карт:" + с.карточек + " " + с.адрес);
    if (с && с.карточек > 0 && с.адрес.includes("q=")) break;
    await p.waitForTimeout(100);
  }
  console.log(кадры.join("\n"));
  await b.close();
})();
