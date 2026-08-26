/**
 * Сквозная обкатка: стартовый параметр MSX → наша обёртка → плеер.
 * Всё, что Егор проверял руками, гоняем сами и печатаем факты.
 */
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });

  const say = (s) => console.log(s);

  await page.goto("https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/launch.json",
    { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  let body = await page.locator("body").innerText().catch(() => "");
  if (/Link Validation|Continue/i.test(body)) {
    say("MSX показал предупреждение о ссылке — подтверждаю");
    const btn = page.locator("text=Continue").first();
    await btn.click({ timeout: 8000 }).catch(async () => {
      await page.keyboard.press("Enter");
    });
    await page.waitForTimeout(9000);
  } else {
    say("Предупреждения не было");
  }

  // MSX может открыть ссылку в новой вкладке
  const pages = ctx.pages();
  const target = pages.find((p) => p.url().includes("/tvweb/")) || page;
  say("Вкладок: " + pages.length + " | адрес цели: " + target.url());
  await target.waitForTimeout(6000);
  body = await target.locator("body").innerText().catch(() => "");
  say("Экран: " + body.replace(/\s+/g, " ").slice(0, 200));
  await target.screenshot({ path: "e2e-1-launch.png" });
  say("Ошибки: " + (errors.length ? errors.slice(0, 5).join(" | ") : "нет"));
  await browser.close();
})();
