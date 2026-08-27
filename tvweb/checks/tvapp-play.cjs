/** Лёгкий клиент с представлением Samsung: доходит ли до кусков видео. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 Chrome/63.0.3239.84 TV Safari/537.36" });
  const p = await ctx.newPage();
  const сеть = [];
  p.on("request", (r) => {
    const u = r.url();
    if (/alloha-hls|alloha\.m3u8|alloha\/seg|hls\.min\.js/.test(u)) сеть.push(u.split("?")[0].replace(/https:\/\/[^/]+/, ""));
  });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));

  await p.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(8000);
  console.log("адрес после развилки: " + p.url().split("?")[0].replace("https://sapkeflykino.ru", ""));
  const отступ = await p.evaluate(() => getComputedStyle(document.body).padding);
  console.log("отступ от краёв: " + отступ);
  console.log("hls подгружен: " + сеть.some((u) => u.includes("hls.min.js")));
  const текст = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 80));
  console.log("экран: " + текст);
  console.log("\nсеть: " + [...new Set(сеть)].join("  |  "));
  console.log("ошибки: " + (errs.length ? [...new Set(errs)].slice(0, 3).join(" | ") : "нет"));
  await browser.close();
})();
