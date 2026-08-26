/** Бесплатный аккаунт: доходит ли дело до фильма после пре-ролла. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const step = (s) => console.log("• " + s);
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
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(11000);
  await page.keyboard.press("Enter");
  for (let i = 1; i <= 10; i++) {
    await page.waitForTimeout(6000);
    const s = await page.evaluate(() => {
      const vids = [...document.querySelectorAll("video")];
      const t = document.body.innerText.replace(/\s+/g, " ").slice(0, 90);
      return "видео:" + vids.length + " " + vids.map((v) => v.currentTime.toFixed(1) + "с/" + (v.currentSrc ? "есть" : "нет")).join(", ") + " | " + t;
    });
    step(i * 6 + "с → " + s);
    if (i === 3) { await page.keyboard.press("Enter"); step("  (нажал ОК — попытка пропустить)"); }
  }
  await page.screenshot({ path: "ad-final.png" });
  console.log("\nОшибки: " + (errs.length ? errs.slice(0, 5).join(" | ") : "нет"));
  await browser.close();
})();
