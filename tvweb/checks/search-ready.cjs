/** Через сколько страница поиска начинает реагировать на набор (медленная связь). */
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
  const t = Date.now();
  let когдаЗапрос = null;
  p.on("request", (r) => { if (r.url().includes("/api/suggest") && !когдаЗапрос) когдаЗапрос = ((Date.now() - t) / 1000).toFixed(1); });
  await p.goto("https://sapkeflykino.ru/search", { waitUntil: "domcontentloaded", timeout: 120000 });
  console.log("разметка пришла: " + ((Date.now() - t) / 1000).toFixed(1) + " с");
  const поле = p.locator('input[aria-label="Поиск"]');
  await поле.waitFor({ timeout: 60000 });
  // Печатаем СРАЗУ, как только поле появилось — как нетерпеливый человек.
  await поле.click();
  await поле.type("венom".replace("om", "ом"), { delay: 80 });
  console.log("набрал к: " + ((Date.now() - t) / 1000).toFixed(1) + " с");
  await p.waitForFunction(() => [...document.querySelectorAll("a")].some((a) => /· (фильм|сериал)$/.test(a.innerText.trim())),
    null, { timeout: 30000 }).catch(() => {});
  console.log("первый запрос подсказок ушёл на: " + (когдаЗапрос || "не ушёл") + " с");
  console.log("подсказки на экране: " + ((Date.now() - t) / 1000).toFixed(1) + " с");
  console.log("значение поля: " + (await поле.inputValue()));
  await b.close();
})();
