/** Запуск плеера: фильм — сразу, сериал — через выбор серии. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const step = (s) => console.log("• " + s);
const zone = (page) => page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, " ");
  const v = document.querySelector("video");
  if (v) return "ПЛЕЕР время:" + v.currentTime.toFixed(1) + " готовность:" + v.readyState +
    " пауза:" + v.paused + " источник:" + (v.currentSrc || "нет").slice(0, 70);
  if (/Выберите серию/i.test(t)) return "ВЫБОР СЕРИИ";
  if (/Загруж|Готов|Ищу|Подключ/i.test(t)) return "ЗАГРУЗКА: " + t.slice(0, 80);
  if (/не удалось|ошибк|нет кода|источник/i.test(t)) return "ОШИБКА: " + t.slice(0, 120);
  return "ЭКРАН: " + t.slice(0, 80);
});

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  page.on("response", (r) => { const u = r.url();
    if (/stream|alloha|hdrezka|hls|m3u8|\.mp4/i.test(u) && r.status() >= 400) errs.push("HTTP " + r.status() + " " + u.slice(0, 90)); });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);

  // Первая карточка в «В тренде» — фильм.
  const name = await page.evaluate(() => (document.activeElement?.innerText || "").replace(/\s+/g, " ").slice(0, 40));
  step("выбран: " + name);
  await page.keyboard.press("Enter");
  for (let i = 1; i <= 8; i++) {
    await page.waitForTimeout(5000);
    step(i * 5 + "с → " + await zone(page));
  }
  await page.screenshot({ path: "play-movie.png" });
  console.log("\nОшибки: " + (errs.length ? "" : "нет"));
  [...new Set(errs)].slice(0, 10).forEach((e) => console.log("  " + e));
  await browser.close();
})();
