/** Лёгкий клиент (Samsung): если Плееры 2–4 пусты — уходит ли в Alloha и идёт ли видео. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36" });
  const p = await ctx.newPage();
  // Имитируем «у запасных пусто», как с «Холодом».
  await p.route(/hdrezka\/api\/(cdnhub|vkmovie|rutube)\?/, (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ translations: [] }) }));
  const сеть = [];
  p.on("request", (r) => { const u = r.url(); if (/hdrezka\/api\/(alloha-hls|cdnhub|vkmovie|rutube)\?|alloha\.m3u8|alloha\/seg/.test(u)) сеть.push(u.split("?")[0].replace("https://kino.lead-seek.ru/hdrezka/api/", "")); });
  const ошибки = []; p.on("pageerror", (e) => ошибки.push(String(e).slice(0, 120)));
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(9000);
  await p.keyboard.press("Enter"); await p.waitForTimeout(5000);
  console.log("карточка: " + (await p.evaluate(() => (document.querySelector(".detail-title") || {}).innerText)));
  await p.keyboard.press("Enter");
  let v = null;
  for (let i = 0; i < 10; i++) {
    await p.waitForTimeout(4000);
    v = await p.evaluate(() => { const x = document.querySelector("video"); return x ? { t: +(x.currentTime || 0).toFixed(1), пауза: x.paused } : null; });
    if (v && v.t > 5) break;
  }
  console.log("экран: " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 110))));
  console.log("видео: " + JSON.stringify(v));
  console.log("сеть: " + [...new Set(сеть)].join(" | "));
  console.log("ошибки: " + (ошибки.length ? ошибки.join(" | ") : "нет"));
  await browser.close();
})();
