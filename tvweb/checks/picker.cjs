/** Выбор серии: есть ли колонка озвучки и можно ли выйти на главную стрелкой. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const где = (page) => page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, " ");
  if (/Выберите серию/.test(t)) return "ВЫБОР СЕРИИ" + (/ОЗВУЧКА/i.test(t) ? " (есть колонка озвучки)" : " (озвучки НЕТ)");
  if (/В тренде|Продолжить просмотр/.test(t)) return "ГЛАВНАЯ";
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
  await page.waitForTimeout(9000);
  console.log("1. сразу:                 " + await где(page));
  await page.waitForTimeout(8000);
  console.log("2. через 8 секунд:        " + await где(page));
  const озв = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].map((x) => x.innerText.replace(/\s+/g, " ").trim());
    return b.filter((t) => /Dub|MVO|DVO|Ukrainian|English|HDrezka/i.test(t)).slice(0, 4);
  });
  console.log("   озвучки в списке:      " + (озв.length ? JSON.stringify(озв) : "нет"));
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(2500);
  console.log("3. стрелка ВЛЕВО:         " + await где(page));
  await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(2500);
  console.log("4. ещё раз ВЛЕВО:         " + await где(page));
  await browser.close();
})();
