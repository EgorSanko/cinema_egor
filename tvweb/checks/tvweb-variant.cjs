/** Проверяем, какой вариант ссылки открывает обёртку БЕЗ подтверждения. */
const { chromium } = require("playwright");
(async () => {
  const variants = ["link:replace:", "link:window:", "link:"];
  const browser = await chromium.launch({ channel: "msedge" });
  for (const v of variants) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await ctx.newPage();
    const url = "https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/probe.json?a=" +
      encodeURIComponent(v + "https://sapkeflykino.ru/tvweb/");
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(11000);
      const pages = ctx.pages();
      const opened = pages.find((p) => p.url().includes("/tvweb/"));
      const body = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
      const prompt = /Link Validation|press continue/i.test(body);
      console.log(v.padEnd(16) + " | подтверждение: " + (prompt ? "ДА" : "нет") +
        " | обёртка открыта: " + (opened ? "ДА (" + (pages.length > 1 ? "новая вкладка" : "та же") + ")" : "нет") +
        " | экран: " + body.slice(0, 70));
    } catch (e) {
      console.log(v.padEnd(16) + " | сбой: " + String(e).slice(0, 80));
    }
    await ctx.close();
  }
  await browser.close();
})();
