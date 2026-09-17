/** Кнопка «Alloha» ВНУТРИ MSX (кадр ТВ, без липкого и отступов): фильм, окно, пульт, «назад». */
const { chromium } = require("playwright");
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
  await page.waitForTimeout(4000);
  await page.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  await page.goto("https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/start.json", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(15000);
  const p = ctx.pages().find((x) => x.url().includes("/tvweb/")) || page;
  console.log("обёртка открыта из MSX: " + p.url().includes("/tvweb/"));
  await p.waitForTimeout(6000);

  await p.evaluate(() => { window.location.hash = "#/tv-watch/movie/969681"; });
  await p.waitForTimeout(25000);
  const видео = () => p.evaluate(() => { const v = [...document.querySelectorAll("video")].filter((x) => x.currentSrc).pop(); return v ? +v.currentTime.toFixed(1) : null; });
  console.log("наш плеер идёт, сек: " + (await видео()));

  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(900);
  await p.keyboard.press("ArrowDown"); await p.waitForTimeout(900);
  const кнопки = await p.evaluate(() => [...document.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label")).filter((a) => /секунд|Пауза|Смотреть|Настройки|Выход|Alloha/.test(a)));
  console.log("ряд кнопок: " + кнопки.join(" | "));
  const номер = кнопки.indexOf("Смотреть в плеере Alloha");
  if (номер < 0) { console.log("КНОПКИ ALLOHA НЕТ"); await browser.close(); return; }
  for (let i = 1; i < номер; i++) { await p.keyboard.press("ArrowRight"); await p.waitForTimeout(400); }
  await p.keyboard.press("Enter"); await p.waitForTimeout(18000);

  const окно = () => p.frames().find((fr) => fr.url().startsWith("https://player.sapkeflykino.ru"));
  const ав = async () => { const f = окно(); return f ? await f.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), пауза: v.paused } : null; }).catch(() => "ERR") : null; };
  console.log("окно Alloha: " + (окно() ? окно().url().replace(/token=[0-9a-f]+/, "token=…").slice(0, 120) : "НЕТ"));
  console.log("Alloha играет: " + JSON.stringify(await ав()));
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
  console.log("после ОК: " + JSON.stringify(await ав()));
  await p.keyboard.press("Enter"); await p.waitForTimeout(2500);
  const до = (await ав())?.t;
  await p.keyboard.press("ArrowRight"); await p.waitForTimeout(3000);
  console.log("перемотка: " + до + " -> " + (await ав())?.t);
  await p.keyboard.press("Escape"); await p.waitForTimeout(4000);
  console.log("после «назад»: окно закрыто=" + !окно() + ", наш плеер сек=" + (await видео()));
  await p.screenshot({ path: process.env.SHOT || "msx-alloha.png" });
  await browser.close();
})();
