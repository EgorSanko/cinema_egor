/** Как выглядит главная, если телевизор не умеет отступы во флекс-раскладке. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const мерка = (page) => page.evaluate(() => {
  const rails = [...document.querySelectorAll("section")];
  const карточки = [...document.querySelectorAll("section button")].slice(0, 3);
  const r = (e) => e.getBoundingClientRect();
  return {
    полок: rails.length,
    зазор_между_полками: rails.length > 1 ? Math.round(r(rails[1]).top - r(rails[0]).bottom) : null,
    зазор_между_карточками: карточки.length > 1 ? Math.round(r(карточки[1]).left - r(карточки[0]).right) : null,
    высота_карточки: карточки.length ? Math.round(r(карточки[0]).height) : null,
    признак: document.documentElement.className.indexOf("no-flex-gap") >= 0 ? "включён" : "нет",
  };
});
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  for (const старый of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    if (старый) {
      // Притворяемся телевизором: убираем поддержку отступов во флексе.
      await ctx.addInitScript(() => {
        const orig = CSSStyleDeclaration.prototype.setProperty;
        CSSStyleDeclaration.prototype.setProperty = function (n, v, p) {
          if (n === "gap" && this.display === "flex") return;
          return orig.call(this, n, v, p);
        };
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.className += " no-flex-gap";
        });
      });
    }
    const page = await ctx.newPage();
    await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(6000);
    await page.evaluate(async ([e, p]) => {
      const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: e, password: p }) });
      const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
    }, [EMAIL, PASS]);
    await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12000);
    console.log((старый ? "СТАРЫЙ ТЕЛЕВИЗОР: " : "ОБЫЧНЫЙ БРАУЗЕР:  ") + JSON.stringify(await мерка(page)));
    await page.screenshot({ path: старый ? "gap-old.png" : "gap-new.png" });
    await ctx.close();
  }
  await browser.close();
})();
