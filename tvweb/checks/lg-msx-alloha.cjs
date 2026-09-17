/**
 * LG (webOS, Chrome 53) в MSX: у Плееров 2–4 пусто → плеер MSX с окном Alloha →
 * «назад» → «Вернуться в кинотеатр» → тот же фильм с кнопкой «Смотреть в Alloha».
 * Плюс синхронизация при запуске (/api/sync).
 */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/53.0.2785.34 Safari/537.36 WebAppManager" });
  await ctx.route(/hdrezka\/api\/(cdnhub|vkmovie|rutube)\?/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"translations":[]}' }));
  const маяки = []; let синхр = 0;
  ctx.on("request", (r) => {
    const u = r.url();
    if (u.includes("/api/sync")) синхр++;
    if (u.includes("/tv-error?m=") && /alloha|msx|синхрон/i.test(decodeURIComponent(u))) маяки.push(decodeURIComponent(u.split("m=")[1]).slice(0, 90));
  });
  const page = await ctx.newPage();
  await page.goto("https://sapkeflykino.ru/tvweb/?t=1789666322.993", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  await page.goto("https://sapkeflykino.ru/tvweb/?t=1789666322.994", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  console.log("запросов /api/sync при запуске: " + синхр);
  await page.evaluate(() => { location.hash = "#/tv-watch/movie/1137844"; });
  await page.waitForTimeout(20000);
  console.log("после запуска фильма: " + page.url().slice(0, 60));
  const plugin = page.frames().find((f) => f.url().includes("/tvapp/msx-alloha.html"));
  const окно = page.frames().find((f) => f.url().startsWith("https://player.sapkeflykino.ru"));
  console.log("плагин: " + !!plugin + ", окно Alloha: " + !!окно);
  if (окно) console.log("видео Alloha: " + JSON.stringify(await окно.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), paused: v.paused } : null; }).catch(() => "ERR")));
  await page.keyboard.press("Escape"); await page.waitForTimeout(4000);
  console.log("экран MSX: " + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 120))));
  await page.keyboard.press("Enter"); await page.waitForTimeout(16000);
  console.log("вернулись: " + page.url().replace("https://sapkeflykino.ru", "").slice(0, 60));
  console.log("экран: " + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200)).catch(() => "?")));
  await page.screenshot({ path: process.env.SHOT || "lg-msx-alloha.png" });
  console.log("маяки: " + маяки.join(" | "));
  await browser.close();
})();
