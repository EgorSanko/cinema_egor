const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  const запросы = [];
  p.on("response", (r) => { if (r.url().includes("/api/suggest")) запросы.push(r.status() + " " + decodeURIComponent(r.url().split("q=")[1] || "")); });
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (512 * 1024) / 8 });
  await p.goto("https://sapkeflykino.ru/search", { waitUntil: "domcontentloaded", timeout: 120000 });
  const поле = p.locator('input[aria-label="Поиск"]');
  await поле.waitFor({ timeout: 60000 });
  await p.waitForTimeout(3000);
  await поле.click();
  const t = Date.now();
  await поле.type("оппенг", { delay: 70 });
  const появились = await p.waitForFunction(
    () => [...document.querySelectorAll("a")].some((a) => /· (фильм|сериал)$/.test(a.innerText.trim())),
    null, { timeout: 25000 },
  ).then(() => ((Date.now() - t) / 1000).toFixed(1)).catch(() => "НЕ ПОЯВИЛИСЬ");
  console.log("подсказки: " + появились + " с");
  console.log("запросы к /api/suggest: " + JSON.stringify(запросы));
  console.log("что в подсказках: " + JSON.stringify(await p.evaluate(() =>
    [...document.querySelectorAll("a")].filter((a) => /· (фильм|сериал)$/.test(a.innerText.trim()))
      .slice(0, 4).map((a) => a.innerText.replace(/\s+/g, " ").trim().slice(0, 40)))));
  await p.screenshot({ path: process.env.DIR + "/suggest2.png" });
  await b.close();
})();
