/** Проверка правок: серии «Холода», подписи на главной, закреплённая шапка. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
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
  const eps = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].filter((b) => /^Серия \d/.test(b.innerText.trim()));
    return { сколько: btns.length,
      номера: btns.map((b) => (b.innerText.match(/Серия (\d+)/) || [])[1]).join(","),
      спревью: btns.filter((b) => b.querySelector("img")).length };
  });
  console.log("• серий в списке: " + eps.сколько + "  → " + eps.номера);
  console.log("• из них с превью: " + eps.спревью);
  await page.screenshot({ path: "ui-eps.png" });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  const home = await page.evaluate(() => {
    const h = document.querySelector("header");
    const cap = [...document.querySelectorAll("p")].find((p) => /Мятеж|Холод|Мажор/.test(p.textContent || ""));
    const r = cap ? cap.getBoundingClientRect() : null;
    const rail = cap ? cap.closest("div.flex.gap-4") || cap.parentElement.parentElement.parentElement : null;
    const rr = rail ? rail.getBoundingClientRect() : null;
    return {
      шапкаЗакреплена: h ? getComputedStyle(h).position : "нет",
      подписьРазмер: cap ? getComputedStyle(cap).fontSize : "нет",
      подписьВысота: r ? Math.round(r.height) : 0,
      подписьВлезает: r && rr ? r.bottom <= rr.bottom + 1 : null,
    };
  });
  console.log("• шапка: " + home.шапкаЗакреплена);
  console.log("• подпись: " + home.подписьРазмер + ", высота " + home.подписьВысота + ", не обрезана: " + home.подписьВлезает);
  await page.screenshot({ path: "ui-home.png" });
  await browser.close();
})();
