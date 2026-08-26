const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(13000);
  const info = await page.evaluate(() => {
    const a = document.activeElement;
    const btns = [...document.querySelectorAll("button")].slice(0, 6).map((b) => (b.innerText || "").replace(/\s+/g, " ").slice(0, 25));
    return { фокус: (a?.innerText || "").replace(/\s+/g, " ").slice(0, 40), тег: a?.tagName,
      первыеКнопки: btns, есть_продолжить: /Продолжить просмотр/.test(document.body.innerText) };
  });
  console.log(JSON.stringify(info, null, 1));
  await browser.close();
})();
