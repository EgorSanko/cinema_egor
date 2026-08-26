/** Что обёртка спрашивает у сервера при запуске просмотра и что получает. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const log = [];
  page.on("response", async (r) => {
    const u = r.url();
    if (!/\/api\/|alloha|hdrezka|m3u8|yohoho|collaps|kp-cdn|stream/i.test(u)) return;
    let body = "";
    try { body = (await r.text()).slice(0, 220).replace(/\s+/g, " "); } catch {}
    log.push(r.status() + "  " + u.replace(/https?:\/\/[^/]+/, "").slice(0, 95) + "\n      " + body);
  });
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(10000);
  log.length = 0;
  await page.keyboard.press("Enter");
  await page.waitForTimeout(35000);
  console.log("Запросы при запуске просмотра:\n");
  log.slice(0, 18).forEach((l) => console.log("  " + l));
  console.log("\nвсего: " + log.length);
  await browser.close();
})();
