/** После правки: появляется ли отклик сразу и когда приходят карточки. */
const { chromium, devices } = require("playwright");
const ЗАПРОС = process.env.Q || "оппенгеймер";
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
  await поле.type(ЗАПРОС, { delay: 50 });
  const t = Date.now();
  await поле.press("Enter");
  const отклик = await p.waitForSelector('[aria-label="Идёт поиск"], text=Ищем…', { timeout: 20000 })
    .then(() => ((Date.now() - t) / 1000).toFixed(2)).catch(() => "не появился");
  const скелет = await p.waitForFunction(() => /Ищем/.test(document.body.innerText), null, { timeout: 20000 })
    .then(() => ((Date.now() - t) / 1000).toFixed(2)).catch(() => "нет");
  await p.waitForSelector('a[href^="/movie/"], a[href^="/tv/"], a[href^="/hd/"]', { timeout: 60000 }).catch(() => {});
  console.log("запрос «" + ЗАПРОС + "» на медленной связи (1.5 Мбит/с)");
  console.log("  отклик в поле: " + отклик + " с");
  console.log("  экран «Ищем…»: " + скелет + " с");
  console.log("  карточки: " + ((Date.now() - t) / 1000).toFixed(1) + " с");
  await p.screenshot({ path: process.env.DIR + "/search-after.png" });
  await b.close();
})();
