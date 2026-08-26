/** «Назад» в настройках плеера: закрывает настройки или весь просмотр? */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const экран = (page) => page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, " ");
  const v = document.querySelector("video");
  if (/Качество|Озвучка|Скорость/.test(t)) return "НАСТРОЙКИ";
  if (/Выберите серию/.test(t)) return "ВЫБОР СЕРИИ";
  if (v && v.currentSrc) return "ПЛЕЕР (" + v.currentTime.toFixed(1) + "с)";
  return "ДРУГОЕ: " + t.slice(0, 60);
});
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13000);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1200);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(16000);
  console.log("1. после запуска серии:      " + await экран(page));
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1500);   // панель
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1200);   // к кнопкам
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700);
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);       // шестерёнка
  console.log("2. открыл настройки:         " + await экран(page));
  for (const k of ["Escape", "Backspace"]) {
    await page.keyboard.press(k); await page.waitForTimeout(2500);
    console.log("3. после «" + k + "»:".padEnd(12) + " " + await экран(page));
    if (!/НАСТРОЙКИ/.test(await экран(page))) break;
  }
  await browser.close();
})();
