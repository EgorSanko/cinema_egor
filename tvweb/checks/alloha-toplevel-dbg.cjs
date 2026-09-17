const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  const net = []; p.on("response", (r) => { if (/player\.sapkeflykino|bnsi/.test(r.url())) net.push(r.status() + " " + r.request().resourceType() + " " + r.url().replace(/token=[0-9a-f]+/, "token=…").slice(0, 90) + " ref=" + (r.request().headers()["referer"] || "-")); });
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(2000);
  await p.evaluate((u) => { location.href = u; }, "https://player.sapkeflykino.ru/?tmdb=318354&type=serial&season=1&episode=1&token=" + process.env.ALLOHA_TOKEN);
  await p.waitForTimeout(10000);
  console.log("текст: " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))));
  console.log(net.slice(0, 8).join("\n"));
  await browser.close();
})();
