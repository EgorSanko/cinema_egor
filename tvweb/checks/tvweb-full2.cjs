/**
 * Полная обкатка: входим тем же запросом, что и само приложение, кладём
 * пользователя в память браузера — и дальше идём по интерфейсу как с пульта.
 */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 140)); });
  const step = (s) => console.log("• " + s);

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(7000);

  const res = await page.evaluate(async ([email, password]) => {
    const r = await fetch("/api/auth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });
    const d = await r.json();
    if (d && d.user) localStorage.setItem("user", JSON.stringify(d.user));
    return { ok: r.ok, keys: d ? Object.keys(d) : [], err: d && d.error };
  }, [EMAIL, PASS]);
  step("вход через запрос: " + JSON.stringify(res));
  if (!res.ok) { console.log("СТОП: войти не удалось"); await browser.close(); return; }

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(10000);
  step("адрес: " + (page.url().split("#")[1] || "главная"));
  let body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  step("экран: " + body.slice(0, 200));
  await page.screenshot({ path: "full-home.png" });

  const links = await page.evaluate(() =>
    [...document.querySelectorAll("a")].map((a) => a.getAttribute("href")).filter((h) => h && h.includes("tv-watch")).slice(0, 5));
  step("ссылок на тайтлы: " + links.length + " " + JSON.stringify(links.slice(0, 3)));
  console.log("\nОшибки: " + (errs.length ? "" : "нет"));
  [...new Set(errs)].slice(0, 8).forEach((e) => console.log("  " + e));
  await browser.close();
})();
