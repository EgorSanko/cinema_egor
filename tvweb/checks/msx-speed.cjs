/** Смена скорости ВНУТРИ MSX: доходим до вкладки «Скорость» и выбираем 2x. */
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
  const p = await ctx.newPage();
  await p.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  await p.evaluate(async ([e, pw]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: pw }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await p.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(13000);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1200);
  await p.keyboard.press("Enter"); await p.waitForTimeout(19000);

  const вид = () => p.evaluate(() => {
    const v = [...document.querySelectorAll("video")].filter((x) => x.currentSrc).pop();
    const t = document.body.innerText.replace(/\s+/g, " ");
    const вкладка = (t.match(/(Качество|Озвучка|Серии|Скорость)(?=[^а-яА-Я]*текущ|\s)/) || [""])[0];
    return { скорость: v ? v.playbackRate : null, время: v ? +v.currentTime.toFixed(1) : null,
             настройки: /Качество .*Озвучка/.test(t), экран: t.slice(0, 110) };
  });
  console.log("1. играет:            " + JSON.stringify(await вид()));
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(1500);  // панель, шкала
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(1200);  // ряд кнопок
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(800);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(800);
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500);      // шестерёнка
  console.log("2. настройки:         " + JSON.stringify(await вид()));
  // Вкладки: Качество -> Озвучка -> Серии -> Скорость
  for (let i = 0; i < 3; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(800); }
  console.log("3. вкладка скорости:  " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 150))));
  // Список: 0.5 0.75 1(текущая) 1.25 1.5 1.75 2 — идём вниз до конца
  for (let i = 0; i < 6; i++) { await p.keyboard.press("ArrowDown"); await p.waitForTimeout(500); }
  await p.keyboard.press("Enter"); await p.waitForTimeout(3000);
  console.log("4. после выбора 2x:   " + JSON.stringify(await вид()));
  await browser.close();
})();
