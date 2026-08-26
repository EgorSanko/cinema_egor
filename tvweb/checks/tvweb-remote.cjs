/**
 * Обкатка ПУЛЬТОМ: только стрелки и «ОК», как на настоящем телевизоре.
 * Проверяем: видно ли фокус, открывается ли тайтл, запускается ли плеер.
 */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const step = (s) => console.log("• " + s);

const focusInfo = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "ФОКУСА НЕТ";
  const r = a.getBoundingClientRect();
  const st = getComputedStyle(a);
  return (a.tagName + " «" + (a.innerText || "").replace(/\s+/g, " ").slice(0, 40) + "»" +
    " видим:" + (r.width > 0 && r.height > 0 && r.top < innerHeight && r.bottom > 0) +
    " рамка:" + (st.outlineWidth !== "0px" || st.boxShadow !== "none" ? "есть" : "НЕТ"));
});

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  step("главная открыта");
  step("фокус сразу: " + await focusInfo(page));

  for (const k of ["ArrowDown", "ArrowRight", "ArrowDown"]) {
    await page.keyboard.press(k); await page.waitForTimeout(900);
    step(k + " → " + await focusInfo(page));
  }
  await page.screenshot({ path: "rem-1-focus.png" });

  await page.keyboard.press("Enter");
  await page.waitForTimeout(11000);
  step("после ОК адрес: " + (page.url().split("#")[1] || "главная"));
  let body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  step("экран: " + body.slice(0, 220));
  await page.screenshot({ path: "rem-2-title.png" });
  step("фокус на тайтле: " + await focusInfo(page));

  // Пытаемся запустить просмотр
  await page.keyboard.press("Enter");
  await page.waitForTimeout(20000);
  const video = await page.evaluate(() => {
    const v = document.querySelector("video");
    if (!v) return "ПЛЕЕРА НЕТ";
    return "время:" + v.currentTime.toFixed(1) + "с готовность:" + v.readyState +
      " источник:" + (v.currentSrc || "").slice(0, 60) + " пауза:" + v.paused;
  });
  step("плеер → " + video);
  body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  step("экран просмотра: " + body.slice(0, 200));
  await page.screenshot({ path: "rem-3-player.png" });

  console.log("\nОшибки: " + (errs.length ? "" : "нет"));
  [...new Set(errs)].slice(0, 10).forEach((e) => console.log("  " + e));
  await browser.close();
})();
