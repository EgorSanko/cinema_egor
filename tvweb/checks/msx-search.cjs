/** Экран поиска ВНУТРИ MSX: раскладка, ввод, результаты. */
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
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  p.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  await p.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(5000);
  await p.evaluate(async ([e, pw]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: pw }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await p.goto("https://sapkeflykino.ru/tvweb/#/tv-search", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(9000);

  const снимок = () => p.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    const кнопки = [...document.querySelectorAll("button")];
    const заЭкраном = кнопки.filter((b) => { const r = b.getBoundingClientRect();
      return r.width > 0 && (r.top < 0 || r.left < 0 || r.bottom > innerHeight || r.right > innerWidth); }).length;
    const карточки = кнопки.filter((b) => b.querySelector("img")).length;
    return { экран: t.slice(0, 120), кнопок: кнопки.length, за_экраном: заЭкраном, карточек: карточки };
  });
  console.log("1. открыт поиск:  " + JSON.stringify(await снимок()));

  // Вводим «холод» экранной клавиатурой: ищем буквы и жмём по ним.
  for (const буква of ["Х", "О", "Л", "О", "Д"]) {
    const кн = p.locator(`button:text-is("${буква}")`).first();
    if (await кн.count()) { await кн.click(); await p.waitForTimeout(400); }
    else console.log("   буквы «" + буква + "» на клавиатуре нет");
  }
  await p.waitForTimeout(6000);
  console.log("2. после ввода:   " + JSON.stringify(await снимок()));
  const поле = await p.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    return t.slice(0, 200);
  });
  console.log("   текст экрана:  " + поле);
  console.log("ошибки: " + (errs.length ? [...new Set(errs)].slice(0, 3).join(" | ") : "нет"));
  await p.screenshot({ path: "search.png" });
  await browser.close();
})();
