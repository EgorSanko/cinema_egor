/**
 * Samsung в MSX: лёгкий клиент → (у запасных пусто) → плеер MSX с плагином Alloha →
 * «назад» закрывает плеер MSX → «Вернуться в кинотеатр» → та же карточка.
 */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36" });
  await ctx.route(/hdrezka\/api\/(cdnhub|vkmovie|rutube)\?/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: '{"translations":[]}' }));
  const маяки = [];
  ctx.on("request", (r) => { const u = r.url(); if (u.includes("/tv-error?m=") && /alloha|msx/i.test(decodeURIComponent(u))) маяки.push(decodeURIComponent(u.split("m=")[1]).slice(0, 90)); });
  const page = await ctx.newPage();
  await page.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  // Как из меню MSX: /tvweb/?msx=1 → развилка Samsung → /tvapp/?…&msx=1
  await page.goto("https://sapkeflykino.ru/tvweb/?msx=1", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  console.log("клиент: " + page.url().replace("https://sapkeflykino.ru", ""));
  await page.keyboard.press("Enter"); await page.waitForTimeout(5000);
  const карточка = await page.evaluate(() => (document.querySelector(".detail-title") || {}).innerText);
  console.log("карточка: " + карточка);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(20000);
  console.log("после запуска: " + page.url().slice(0, 70));
  const plugin = page.frames().find((f) => f.url().includes("/tvapp/msx-alloha.html"));
  const окно = page.frames().find((f) => f.url().startsWith("https://player.sapkeflykino.ru"));
  console.log("плагин в MSX: " + !!plugin + ", окно Alloha: " + !!окно);
  if (окно) console.log("видео Alloha: " + JSON.stringify(await окно.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), paused: v.paused, muted: v.muted } : null; }).catch(() => "ERR")));
  // «назад» в MSX
  await page.keyboard.press("Escape"); await page.waitForTimeout(4000);
  console.log("после «назад»: плагин закрыт=" + !page.frames().some((f) => f.url().includes("/tvapp/msx-alloha.html")));
  const пункты = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
  console.log("экран MSX: " + пункты);
  // «Вернуться в кинотеатр» — первый пункт
  await page.keyboard.press("Enter"); await page.waitForTimeout(14000);
  console.log("вернулись: " + page.url().replace("https://sapkeflykino.ru", "").slice(0, 50) + " | карточка: " +
    (await page.evaluate(() => { const d = document.querySelector(".detail-title"); const s = document.querySelector("#screen-detail"); return d && s && s.className.indexOf("hidden") < 0 ? d.innerText : "НЕ открыта"; }).catch(() => "?")));
  await page.screenshot({ path: process.env.SHOT || "msx-alloha-plugin.png" });
  console.log("маяки: " + маяки.join(" | "));
  await browser.close();
})();
