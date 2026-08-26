/**
 * Обкатка ТВ-обёртки без телевизора.
 *
 * Проверяем то, что Егор проверял руками каждый раз: открывается ли обёртка
 * через стартовый параметр MSX и рисуются ли подборки. Всё, что говорит
 * страница — ошибки, сетевые запросы, шаги проверки загрузки — собираем сами.
 */
const { chromium } = require("playwright");
const OUT = process.env.OUT || ".";

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();

  const errors = [], reqs = [], beacons = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
  page.on("pageerror", (e) => errors.push("ОШИБКА СТРАНИЦЫ: " + String(e).slice(0, 200)));
  page.on("request", (r) => {
    const u = r.url();
    if (u.includes("/tv-error")) beacons.push(decodeURIComponent(u.split("m=")[1] || "").split("&")[0]);
    else if (u.includes("/tmdb-api/") || u.includes("/tvweb/") || u.includes("/msx/")) reqs.push(u.replace(/https:\/\/[^/]+/, "").split("?")[0]);
  });

  const target = process.argv[2];
  console.log("Открываю: " + target);
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(Number(process.argv[3] || 20000));

  console.log("Адрес сейчас: " + page.url());
  const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 400);
  console.log("Текст на экране: " + text);

  const counts = {};
  reqs.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
  console.log("\nЗапросы:");
  Object.entries(counts).sort().forEach(([k, v]) => console.log("  " + (v > 1 ? "!! " : "   ") + k + "  ×" + v));
  console.log("\nШаги проверки загрузки:");
  beacons.forEach((b) => console.log("  " + b));
  console.log("\nОшибки: " + (errors.length ? "" : "нет"));
  errors.slice(0, 10).forEach((e) => console.log("  " + e));

  await page.screenshot({ path: OUT + "/" + (process.argv[4] || "shot") + ".png" });
  console.log("\nСнимок: " + OUT + "/" + (process.argv[4] || "shot") + ".png");
  await browser.close();
})();
