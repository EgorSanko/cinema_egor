/** Лёгкий клиент: окно Alloha через прослойку — нажатие пульта запускает видео СО ЗВУКОМ. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 (KHTML, like Gecko) Version/5.0 TV Safari/537.36" });
  const p = await ctx.newPage();
  await p.route(/hdrezka\/api\/(cdnhub|vkmovie|rutube)\?/, (r) => r.fulfill({ status: 200, contentType: "application/json", body: '{"translations":[]}' }));
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(9000);
  await p.keyboard.press("Enter"); await p.waitForTimeout(5000);
  await p.keyboard.press("Enter"); await p.waitForTimeout(14000);
  const окно = () => p.frames().find((fr) => fr.url().startsWith("https://player.sapkeflykino.ru"));
  const ав = async () => { const f = окно(); return f ? await f.evaluate(() => { const x = document.querySelector("video"); return x ? { t: +x.currentTime.toFixed(1), пауза: x.paused, беззвука: x.muted, громк: x.volume, фокус: document.hasFocus() } : null; }).catch((e) => "ERR " + e.message.slice(0, 60)) : null; };
  const f0 = окно(); if (f0) { try { await f0.frameElement().then((h) => h.click({ force: true })); } catch (e) {} }
  await p.waitForTimeout(1500);
  console.log("до нажатия: " + JSON.stringify(await ав()));
  for (const key of ["Enter", "Space"]) {
    await p.keyboard.press(key); await p.waitForTimeout(5000);
    const s = await ав();
    console.log("после " + key + ": " + JSON.stringify(s));
    if (s && s.пауза === false) break;
  }
  await browser.close();
})();
