/** Плеер Alloha открытием страницы целиком (переход с нашего сайта), без iframe: пускает ли, играет ли, возвращает ли «назад». */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36" });
  const p = await ctx.newPage();
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(3000);
  const url = "https://player.sapkeflykino.ru/?tmdb=318354&type=serial&season=1&episode=1&token=" + (process.env.ALLOHA_TOKEN || "");
  await p.evaluate((u) => { location.href = u; }, url);
  await p.waitForTimeout(9000);
  const стоп = await p.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), paused: v.paused, muted: v.muted } : null; });
  console.log("открылось: " + p.url().slice(0, 60) + " referer-проверка пройдена: " + !/forbidden|доступ|ошибк/i.test(await p.evaluate(() => document.body.innerText.slice(0, 200))));
  console.log("до нажатия: " + JSON.stringify(стоп));
  await p.keyboard.press("Enter"); await p.waitForTimeout(6000);
  let v = await p.evaluate(() => { const x = document.querySelector("video"); return x ? { t: +x.currentTime.toFixed(1), paused: x.paused, muted: x.muted } : null; });
  if (v && v.paused) { await p.keyboard.press("Space"); await p.waitForTimeout(5000); v = await p.evaluate(() => { const x = document.querySelector("video"); return x ? { t: +x.currentTime.toFixed(1), paused: x.paused, muted: x.muted } : null; }); }
  console.log("после ОК: " + JSON.stringify(v));
  await p.goBack({ waitUntil: "domcontentloaded" }); await p.waitForTimeout(3000);
  console.log("после «назад»: " + p.url().slice(0, 60));
  await browser.close();
})();
