/** «Холод»: открывается ли он сериалом и доходит ли до видео. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const seen = [];
  page.on("request", (r) => { const u = r.url();
    if (/tmdb-api\/(movie|tv)\/318354|alloha-hls|external_ids/.test(u)) seen.push(u.replace(/https:\/\/[^/]+/, "").split("&api")[0].slice(0, 70)); });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
    // Кладём В ИСТОРИЮ ровно ту битую запись, что была у Егора, и смотрим,
    // починит ли её защита при чтении.
    localStorage.setItem("kino_history", JSON.stringify([{
      id: 318354, type: "movie", title: "Холод", first_air_date: "2026-07-16",
      watchedAt: Date.now(), progress: 179, duration: 11517,
    }]));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(11000);
  const fixed = await page.evaluate(() => {
    const h = JSON.parse(localStorage.getItem("kino_history") || "[]");
    return h.map((x) => x.id + ":" + x.type).join(", ");
  });
  console.log("• запись в истории после чтения: " + fixed);
  const t = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
  console.log("• есть «Продолжить просмотр»: " + /Продолжить просмотр/.test(t));

  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(12000);
  console.log("• экран: " + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).slice(0, 140));
  for (const k of ["ArrowRight", "Enter"]) { await page.keyboard.press(k); await page.waitForTimeout(3000); }
  for (let i = 1; i <= 7; i++) {
    await page.waitForTimeout(6000);
    const v = await page.evaluate(() => { const x = [...document.querySelectorAll("video")].filter(v => v.currentSrc).pop();
      return x ? x.currentTime.toFixed(1) + "с" + (/РЕКЛАМА/i.test(document.body.innerText) ? " (реклама)" : "") : "нет видео"; });
    console.log("  " + i * 6 + "с → " + v);
  }
  console.log("\nзапрошено: " + [...new Set(seen)].join("  |  "));
  await browser.close();
})();
