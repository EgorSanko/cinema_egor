/** Лёгкий клиент на экране 1920x1080: окно Alloha вне растянутого холста — занимает весь экран без масштаба. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36" });
  const p = await ctx.newPage();
  await p.route(/hdrezka\/api\/(cdnhub|vkmovie|rutube)\?/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"translations":[]}' }));
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(9000);
  await p.keyboard.press("Enter"); await p.waitForTimeout(5000);
  await p.keyboard.press("Enter"); await p.waitForTimeout(15000);
  const r = await p.evaluate(() => {
    const f = document.getElementById("alloha-frame");
    if (!f) return null;
    const b = f.getBoundingClientRect();
    let parentScaled = false, n = f.parentElement;
    while (n) { const t = getComputedStyle(n).transform; if (t && t !== "none") parentScaled = true; n = n.parentElement; }
    return { rect: [Math.round(b.width), Math.round(b.height)], внутриХолста: parentScaled, родитель: f.parentElement.tagName };
  });
  const al = p.frames().find((fr) => fr.url().startsWith("https://player.sapkeflykino.ru"));
  const inner = al ? await al.evaluate(() => [innerWidth, innerHeight]) : null;
  console.log("окно: " + JSON.stringify(r) + " размер внутри их плеера: " + JSON.stringify(inner));
  await browser.close();
})();
