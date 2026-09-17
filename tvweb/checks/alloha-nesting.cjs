/** Кому окно Alloha шлёт события: родителю или самому верхнему окну (как если MSX держит нас во фрейме). */
const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const src = "https://player.sapkeflykino.ru/?tmdb=157336&type=movie&autoplay=1&token=" + (process.env.ALLOHA_TOKEN || "");
  const log = "window.__m=[];addEventListener('message',function(e){if(e.origin!=='https://player.sapkeflykino.ru')return;var d=e.data;try{d=typeof d==='string'?JSON.parse(d):d}catch(x){};window.__m.push(d&&d.event)});";
  await page.route("https://msx-fake.sapkeflykino.ru/top", (r) => r.fulfill({ contentType: "text/html",
    body: `<html><body style="margin:0"><script>${log}</script><iframe id="mid" src="https://sapkeflykino.ru/__mid" width="1280" height="720" style="border:0" allow="autoplay; fullscreen"></iframe></body></html>` }));
  await page.route("https://sapkeflykino.ru/__mid", (r) => r.fulfill({ contentType: "text/html",
    body: `<html><body style="margin:0"><script>${log}</script><iframe id="al" src="${src}" width="1280" height="720" style="border:0" allow="autoplay; fullscreen"></iframe></body></html>` }));
  await page.goto("https://msx-fake.sapkeflykino.ru/top", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(18000);
  const mid = page.frames().find((f) => f.url().includes("/__mid"));
  const top = await page.evaluate(() => window.__m.slice(0, 6));
  const midMsgs = mid ? await mid.evaluate(() => window.__m.slice(0, 6)) : "нет фрейма";
  // команда play/pause из среднего окна — слушает ли плеер
  const al = page.frames().find((f) => f.url().startsWith("https://player.sapkeflykino.ru"));
  const before = al ? await al.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), paused: v.paused } : null; }) : null;
  if (mid) await mid.evaluate(() => document.getElementById("al").contentWindow.postMessage(JSON.stringify({ api: "pause" }), "*"));
  await page.waitForTimeout(2000);
  const after = al ? await al.evaluate(() => { const v = document.querySelector("video"); return v ? { t: +v.currentTime.toFixed(1), paused: v.paused } : null; }) : null;
  console.log("события в САМОМ ВЕРХНЕМ окне (MSX): " + JSON.stringify(top));
  console.log("события в НАШЕМ окне (родитель):    " + JSON.stringify(midMsgs));
  console.log("команда pause из нашего окна: " + JSON.stringify(before) + " -> " + JSON.stringify(after));
  await browser.close();
})();
