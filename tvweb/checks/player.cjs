/** Шкала перемотки и скорость: проверяем по самому видео, а не по виду. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const вид = (page) => page.evaluate(() => {
  const v = [...document.querySelectorAll("video")].filter((x) => x.currentSrc).pop();
  return v ? { время: +v.currentTime.toFixed(1), скорость: v.playbackRate, пауза: v.paused } : null;
});
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(5000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13000);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1200);
  await page.keyboard.press("Enter"); await page.waitForTimeout(17000);
  console.log("плеер:            " + JSON.stringify(await вид(page)));

  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1500);   // панель, зона «шкала»
  const до = await вид(page);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1500);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1500);
  const после = await вид(page);
  console.log("ШКАЛА: было " + до.время + "с, стало " + после.время + "с  → " +
    (после.время - до.время > 15 ? "РАБОТАЕТ" : "НЕ РАБОТАЕТ"));

  // Настройки → вкладка «Скорость» → выбрать 2×
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1000);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(600);
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(600);
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  const текст = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 150));
  console.log("настройки:        " + текст);
  for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700); }
  const вкладка = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 130));
  console.log("после вкладок:    " + вкладка);
  for (let i = 0; i < 6; i++) { await page.keyboard.press("ArrowDown"); await page.waitForTimeout(500); }
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  console.log("СКОРОСТЬ: " + JSON.stringify(await вид(page)));
  await browser.close();
})();
