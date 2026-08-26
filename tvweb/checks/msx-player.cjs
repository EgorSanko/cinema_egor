/** Панель плеера ВНУТРИ MSX, кадр телевизора, без липкого и без отступов. */
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
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/start.json",
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(15000);
  const p = ctx.pages().find((x) => x.url().includes("/tvweb/")) || page;
  await p.waitForTimeout(6000);

  // главная -> сериал -> серия
  await p.evaluate(() => { window.location.hash = "#/tv-watch/tv/318354"; });
  await p.waitForTimeout(13000);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1200);
  await p.keyboard.press("Enter"); await p.waitForTimeout(18000);

  const состояние = () => p.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    const v = [...document.querySelectorAll("video")].filter((x) => x.currentSrc).pop();
    const кнопки = [...document.querySelectorAll("button[aria-label]")]
      .map((b) => b.getAttribute("aria-label")).filter((a) => /секунд|Пауза|Смотреть|Настройки|Выход/.test(a));
    const полоса = [...document.querySelectorAll("div")].some((d) => {
      const s = getComputedStyle(d);
      return s.backgroundColor.includes("163, 230, 53") && d.getBoundingClientRect().height < 14 && d.getBoundingClientRect().width > 200;
    });
    // Время на экране: «0:14 / 45:30» — по нему видно, знает ли приложение
    // длительность. Пустая полоса всегда означала нули именно здесь.
    const время = (t.match(/\d+:\d{2}\s*\/\s*\d+:\d{2}/) || t.match(/\d+:\d{2}/) || ["нет"])[0];
    return { видео: v ? +v.currentTime.toFixed(1) : null, панель: кнопки.length, полоса,
             время_на_экране: время, настройки: /Качество|Озвучка|Скорость/.test(t) };
  });
  console.log("серия идёт:           " + JSON.stringify(await состояние()));
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(1500);
  console.log("после ВНИЗ:           " + JSON.stringify(await состояние()));
  const до = await состояние();
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1500);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(1500);
  const после = await состояние();
  console.log("ШКАЛА: " + до.видео + " -> " + после.видео + "  " + (после.видео - до.видео > 15 ? "перематывает" : "НЕ ПЕРЕМАТЫВАЕТ"));
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(1200);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(800);
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(800);
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
  console.log("после шестерёнки:     " + JSON.stringify(await состояние()));
  await p.screenshot({ path: "msx-player.png" });
  await browser.close();
})();
