/** Сериал: выбор серии → плеер; затем меню озвучки и качества. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const step = (s) => console.log("• " + s);
const state = (page) => page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, " ");
  const v = document.querySelector("video");
  if (v && v.currentSrc) return "ПЛЕЕР время:" + v.currentTime.toFixed(1) + " пауза:" + v.paused;
  if (/Выберите серию/i.test(t)) return "ВЫБОР СЕРИИ";
  return t.slice(0, 110);
});
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/108978", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  step("экран сериала: " + await state(page));

  // В выборе серии: вправо к списку серий, вниз на 2-ю, ОК.
  for (const k of ["ArrowRight", "ArrowDown", "Enter"]) {
    await page.keyboard.press(k); await page.waitForTimeout(2500);
    step(k + " → " + await state(page));
  }
  for (let i = 1; i <= 6; i++) { await page.waitForTimeout(5000); step(i * 5 + "с → " + await state(page)); }
  await page.screenshot({ path: "ser-1-play.png" });

  // Меню в плеере: ОК показывает панель, ищем озвучку и качество.
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  let t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  step("панель плеера: " + t.slice(0, 220));
  step("есть слово «озвуч»: " + /озвуч/i.test(t) + " | есть «качеств»: " + /качеств/i.test(t));
  await page.screenshot({ path: "ser-2-controls.png" });

  console.log("\nОшибки: " + (errs.length ? "" : "нет"));
  [...new Set(errs)].slice(0, 8).forEach((e) => console.log("  " + e));
  await browser.close();
})();
