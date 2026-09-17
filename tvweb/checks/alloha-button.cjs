/** Кнопка «Alloha» в ТВ-обёртке: видна, открывает окно, пульт управляет им, «назад» возвращает в наш плеер. */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const out = {};
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" })));
  await page.goto("https://sapkeflykino.ru/tvweb/?t=" + Date.now() + "#/tv-watch/movie/157336", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(15000);
  const vt = () => page.evaluate(() => { const v = document.querySelector("video"); return v ? +v.currentTime.toFixed(1) : null; });
  out.nativeStart = await vt();
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(700);
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(700);
  out.buttons = await page.evaluate(() => [...document.querySelectorAll("button[aria-label]")].map((b) => b.getAttribute("aria-label")));
  for (let i = 0; i < 3; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(400); }
  await page.keyboard.press("Enter");
  await page.waitForTimeout(16000);
  const af = () => page.frames().find((fr) => fr.url().startsWith("https://player.sapkeflykino.ru"));
  const av = async () => { const f = af(); return f ? await f.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), paused: v.paused } : null; }).catch(() => "ERR") : null; };
  out.allohaSrc = af() ? af().url().replace(/token=[0-9a-f]+/, "token=…").slice(0, 110) : null;
  out.allohaPlaying = await av();
  out.nativePausedAt = await vt();
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  out.afterOk = await av();
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  const before = (await av())?.t;
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(3000);
  out.seek = { before, after: (await av())?.t };
  await page.keyboard.press("Escape"); await page.waitForTimeout(4000);
  out.afterBack = {
    iframeGone: !af(),
    native: await vt(),
    nativePaused: await page.evaluate(() => { const v = document.querySelector("video"); return v ? v.paused : null; }),
  };
  console.log(JSON.stringify(out, null, 1));
  await browser.close();
})();
