const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ ...devices["iPhone 13"] });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.5 * 1024 * 1024) / 8, uploadThroughput: (512 * 1024) / 8 });
  const t = Date.now();
  const запросы = [];
  p.on("request", (r) => { if (r.url().includes("/api/suggest")) запросы.push(((Date.now() - t) / 1000).toFixed(1) + "с " + decodeURIComponent((r.url().split("q=")[1] || ""))); });
  await p.goto("https://sapkeflykino.ru/search", { waitUntil: "domcontentloaded", timeout: 120000 });
  const поле = p.locator('input[aria-label="Поиск"]');
  await поле.waitFor({ timeout: 60000 });
  await поле.click();
  await поле.type("веном", { delay: 80 });
  const сразу = await поле.inputValue();
  console.log("сразу после набора в поле: «" + сразу + "» (" + ((Date.now() - t) / 1000).toFixed(1) + " с)");
  await p.waitForTimeout(6000);
  console.log("через 6 с в поле: «" + (await поле.inputValue()) + "»");
  console.log("запросы подсказок: " + JSON.stringify(запросы));
  console.log("подсказки: " + JSON.stringify(await p.evaluate(() => [...document.querySelectorAll("a")]
    .filter((a) => /· (фильм|сериал)$/.test(a.innerText.trim())).slice(0, 3).map((a) => a.innerText.replace(/\s+/g, " ").slice(0, 32)))));
  await b.close();
})();
