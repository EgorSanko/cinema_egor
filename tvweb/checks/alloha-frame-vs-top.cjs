const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const src = "https://player.sapkeflykino.ru/?tmdb=318354&type=serial&season=1&episode=1&token=" + process.env.ALLOHA_TOKEN;
  await p.route("https://sapkeflykino.ru/__cmp", (r) => r.fulfill({ contentType: "text/html", body: `<iframe src="${src}" width="1280" height="720" allow="autoplay; fullscreen" referrerpolicy="no-referrer-when-downgrade"></iframe>` }));
  await p.goto("https://sapkeflykino.ru/__cmp", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(10000);
  const f = p.frames().find((x) => x.url().startsWith("https://player.sapkeflykino.ru"));
  console.log("во фрейме: " + (f ? await f.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 120)) : "нет"));
  // top-level, но с поддельным «я во фрейме» не подделать; пробуем прямой заход с Referer
  const p2 = await ctx.newPage();
  await p2.goto(src, { waitUntil: "domcontentloaded", referer: "https://sapkeflykino.ru/" });
  await p2.waitForTimeout(9000);
  console.log("целиком: " + (await p2.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 120))));
  await browser.close();
})();
