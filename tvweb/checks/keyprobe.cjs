const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errs.push("консоль: " + m.text().slice(0, 200)); });
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(14000);

  const info = await page.evaluate(() => {
    // Считаем, сколько обработчиков клавиш висит: подменяем добавление ДО
    // и смотрим, что уже стоит, — напрямую список получить нельзя, поэтому
    // проверяем косвенно: шлём событие сами и смотрим, изменится ли экран.
    const было = document.body.innerText;
    const ev = new KeyboardEvent("keydown", { key: "ArrowRight", keyCode: 39, which: 39, bubbles: true });
    window.dispatchEvent(ev);
    return { активный: document.activeElement ? document.activeElement.tagName : "нет", было: было.length };
  });
  await page.waitForTimeout(1500);
  const после = await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => {
      const s = getComputedStyle(x);
      return s.boxShadow && s.boxShadow !== "none" && !/rgba\(0, 0, 0/.test(s.boxShadow.slice(0, 20));
    });
    return b ? b.innerText.replace(/\s+/g, " ").slice(0, 30) : "нет подсветки";
  });
  console.log("активный элемент: " + info.активный);
  console.log("после события ArrowRight подсвечено: " + после);
  console.log("ошибки: " + (errs.length ? [...new Set(errs)].slice(0, 5).join("\n  ") : "нет"));
  await browser.close();
})();
