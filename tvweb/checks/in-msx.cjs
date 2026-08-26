/**
 * Проверка ВНУТРИ MSX, а не на голой странице.
 *
 * Егор смотрит через MSX Player на телевизоре: кадр 1280x720 (MSX сообщает
 * «Scale layout: 1.5»), движок старый. Поэтому здесь: запуск через стартовую
 * страницу MSX, тот же кадр, и отключены возможности, которых на телевизоре
 * нет — липкое закрепление и отступы во флекс-раскладке.
 */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    const o = CSSStyleDeclaration.prototype.setProperty;
    CSSStyleDeclaration.prototype.setProperty = function (n, v, p) {
      if (n === "position" && v === "sticky") return;
      if (n === "gap" || n === "column-gap" || n === "row-gap") return;
      return o.call(this, n, v, p);
    };
  });
  const page = await ctx.newPage();
  // Вход кладём заранее, чтобы попасть сразу на главную.
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);

  // Запуск ЧЕРЕЗ MSX, как у Егора.
  await page.goto("https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/start.json",
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(16000);
  const цель = ctx.pages().find((p) => p.url().includes("/tvweb/")) || page;
  console.log("открылось через MSX: " + (цель.url().includes("/tvweb/") ? "ДА" : "НЕТ") + "  " + цель.url().split("?")[0]);
  await цель.waitForTimeout(9000);

  const снять = () => цель.evaluate(() => {
    const h = document.querySelector("header");
    if (!h) return { нет: document.body.innerText.replace(/\s+/g, " ").slice(0, 70) };
    const hb = h.getBoundingClientRect();
    const эл = [...h.querySelectorAll("img,button")].map((e) => {
      const b = e.getBoundingClientRect();
      return (e.tagName + " " + (e.innerText || "лого").replace(/\s+/g, " ").slice(0, 8)).padEnd(15) +
        "y=" + Math.round(b.top) + " x=" + Math.round(b.left);
    });
    const видна = hb.top >= 0 && hb.bottom <= innerHeight;
    return { шапка: "y=" + Math.round(hb.top) + " в=" + Math.round(hb.height), видна, элементы: эл };
  });
  console.log("до прокрутки:    " + JSON.stringify(await снять()));
  for (let i = 0; i < 10; i++) { await цель.keyboard.press("ArrowDown"); await цель.waitForTimeout(500); }
  console.log("после прокрутки: " + JSON.stringify(await снять()));
  await цель.screenshot({ path: "in-msx.png" });
  await browser.close();
})();
