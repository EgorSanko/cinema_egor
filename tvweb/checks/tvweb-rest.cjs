/** Поиск и путь бесплатного аккаунта (пре-ролл перед фильмом). */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const step = (s) => console.log("• " + s);
const txt = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);

  // ── Поиск: ищем сериал, он раньше не показывался ──
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-search", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(9000);
  const r = await page.evaluate(async () => {
    const res = await fetch("/api/tv-search?q=" + encodeURIComponent("ментали"));
    const d = await res.json();
    return { всего: d.length, сериалов: d.filter((x) => x.type === "tv").length,
      первые: d.slice(0, 4).map((x) => x.type + ":" + x.title) };
  });
  step("поиск «ментали»: " + JSON.stringify(r, null, 0));
  await page.screenshot({ path: "rest-search.png" });

  console.log("\nОшибки: " + (errs.length ? errs.slice(0, 5).join(" | ") : "нет"));
  await browser.close();
})();
