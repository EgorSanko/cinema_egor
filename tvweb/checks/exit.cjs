/** Выход на главную стрелкой влево из любой колонки + отступ от краёв. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const где = (page) => page.evaluate(() => {
  const t = document.body.innerText.replace(/\s+/g, " ");
  if (/Выберите серию/.test(t)) return "ВЫБОР СЕРИИ";
  if (/В тренде/.test(t)) return "ГЛАВНАЯ";
  return "ДРУГОЕ: " + t.slice(0, 45);
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
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(11000);
  const pad = await page.evaluate(() => {
    const r = document.getElementById("root");
    const h = document.querySelector("header");
    return { отступ: r ? getComputedStyle(r).padding : "нет",
             шапка_от_верха: h ? Math.round(h.getBoundingClientRect().top) : "нет" };
  });
  console.log("отступ от краёв: " + JSON.stringify(pad));

  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13000);
  console.log("1. открыл сериал:   " + await где(page));
  for (let i = 1; i <= 4; i++) {
    await page.keyboard.press("ArrowLeft"); await page.waitForTimeout(2200);
    const w = await где(page);
    console.log("   ВЛЕВО ×" + i + ":       " + w);
    if (w === "ГЛАВНАЯ") break;
  }
  await page.screenshot({ path: "exit.png" });
  await browser.close();
})();
