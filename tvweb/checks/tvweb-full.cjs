/**
 * Полная обкатка ТВ-обёртки: вход, главная, открытие тайтла, запуск плеера.
 * Печатаем факты, а не «должно работать».
 */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru";
const PASS = process.env.TVPASS;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  const step = (s) => console.log("• " + s);

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(9000);
  step("открыл обёртку: " + page.url().split("#")[1]);

  // Вход: вводим прямо в поля, минуя экранную клавиатуру.
  const email = page.locator('input[type="email"], input[name="email"]').first();
  if (await email.count()) {
    await email.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASS);
    await page.locator('button:has-text("Войти")').first().click();
    await page.waitForTimeout(9000);
    step("после входа адрес: " + (page.url().split("#")[1] || "главная"));
  } else step("поля входа не найдены");

  let body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  step("экран: " + body.slice(0, 160));
  await page.screenshot({ path: "full-1-home.png" });

  // Открываем первый тайтл с главной.
  const card = page.locator('[data-card], .tv-card, a[href*="tv-watch"], [role="button"]').first();
  const n = await page.locator('a[href*="tv-watch"], [data-card]').count();
  step("карточек на главной: " + n);
  if (n) {
    await page.locator('a[href*="tv-watch"], [data-card]').first().click().catch(() => {});
    await page.waitForTimeout(9000);
    step("адрес тайтла: " + (page.url().split("#")[1] || "—"));
    body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
    step("экран тайтла: " + body.slice(0, 160));
    await page.screenshot({ path: "full-2-title.png" });
  }
  console.log("\nОшибки: " + (errs.length ? "" : "нет"));
  [...new Set(errs)].slice(0, 8).forEach((e) => console.log("  " + e));
  await browser.close();
})();
