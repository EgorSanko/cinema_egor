/** Цвета подписей, отступ от краёв и работоспособность экрана просмотра. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  const t = await page.evaluate(() => {
    const cap = [...document.querySelectorAll("p")].find((p) => /Холод|Мятеж|Мажор/.test(p.textContent || ""));
    const root = document.getElementById("root");
    const head = document.querySelector("header");
    const cs = (e) => e ? getComputedStyle(e) : null;
    return {
      тема: document.documentElement.className.includes("dark") ? "тёмная" : "СВЕТЛАЯ",
      цвет_подписи: cap ? cs(cap).color : "нет",
      фон_страницы: cs(document.body).backgroundColor,
      отступ_сверху: root ? cs(root).paddingTop : "нет",
      шапка_сверху: head ? Math.round(head.getBoundingClientRect().top) : "нет",
    };
  });
  console.log("главная: " + JSON.stringify(t, null, 0));
  await page.screenshot({ path: "theme-home.png" });
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(14000);
  const w = await page.evaluate(() => {
    const t = document.body.innerText.replace(/\s+/g, " ");
    const озв = [...document.querySelectorAll("button")].map((x) => x.innerText.replace(/\s+/g, " "))
      .filter((s) => /Dub|MVO|DVO|Ukrainian|English/i.test(s)).slice(0, 3);
    return { экран: /Выберите серию/.test(t) ? "ВЫБОР СЕРИИ" : t.slice(0, 50), озвучки: озв };
  });
  console.log("просмотр: " + JSON.stringify(w));
  console.log("ошибки: " + (errs.length ? [...new Set(errs)].slice(0, 3).join(" | ") : "нет"));
  await browser.close();
})();
