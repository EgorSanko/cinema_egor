/**
 * Прогон «как на старом телевизоре»: перед загрузкой страницы УБИРАЕМ из
 * браузера возможности, которых нет на Tizen 5 (Chromium 63). Если подпорки в
 * index.html работают, приложение обязано пройти весь путь как ни в чём не
 * бывало. Это самая близкая к настоящему телевизору проверка, доступная здесь.
 */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
let fails = 0;
const ok = (n, g, d) => { if (!g) fails++; console.log((g ? "  ДА  " : "  НЕТ ") + n + (d ? " — " + d : "")); };
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    // Так выглядит движок 2019 года: этих возможностей там нет.
    try { delete Object.fromEntries; } catch (e) {}
    try { delete window.AbortController; } catch (e) {}
    try { delete window.queueMicrotask; } catch (e) {}
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 130)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 130)); });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);
  const shims = await page.evaluate(() => ({
    fromEntries: typeof Object.fromEntries, abort: typeof window.AbortController,
    проба: (() => { try { return JSON.stringify(Object.fromEntries([["a", 1], ["b", 2]])); } catch (e) { return "СБОЙ " + e; } })(),
  }));
  ok("подпорки встали", shims.fromEntries === "function" && shims.abort === "function", JSON.stringify(shims));

  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13000);
  let t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  ok("подборки загрузились", /подборок: [1-9]/.test(t), (t.match(/подборок: \d+/) || [""])[0]);
  ok("не висит на загрузке", !/Готовлю подборки|Загружаю подборки/i.test(t));

  await page.keyboard.press("Enter");
  let played = 0;
  for (let i = 0; i < 16; i++) {
    await page.waitForTimeout(6000);
    const v = await page.evaluate(() => {
      const vs = [...document.querySelectorAll("video")].filter((x) => x.currentSrc);
      if (!vs.length) return null;
      return { t: vs[vs.length - 1].currentTime, ad: /РЕКЛАМА/i.test(document.body.innerText) };
    });
    if (v && !v.ad) played = v.t;
  }
  ok("фильм играет", played > 5, "доиграл до " + played.toFixed(1) + "с");
  const uniq = [...new Set(errs)];
  ok("ошибок нет", uniq.length === 0, uniq.slice(0, 4).join(" | "));
  console.log("\n" + (fails ? "ПРОВАЛОВ: " + fails : "НА СТАРОМ ДВИЖКЕ ВСЁ ПРОШЛО"));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
