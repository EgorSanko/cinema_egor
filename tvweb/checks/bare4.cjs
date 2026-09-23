const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ viewport: { width: 900, height: 600 } });
  const p = await ctx.newPage();
  const ответы = [];
  p.on("response", (r) => {
    if (/cdnhub\/proxy/.test(r.url())) {
      ответы.push(r.status() + " cr=" + (r.headers()["content-range"] || "нет") + " cl=" + (r.headers()["content-length"] || "?"));
    }
  });
  await p.goto("https://sapkeflykino.ru/terms", { waitUntil: "load", timeout: 60000 });
  await p.waitForTimeout(2000);
  const url = await p.evaluate(async () => {
    const r = await fetch("https://kino.lead-seek.ru/hdrezka/api/cdnhub?imdb=tt0317740&type=movie");
    const d = await r.json();
    return d.translations[0].quality["1080p"];
  });
  console.log("ссылка есть: " + !!url);
  await p.evaluate((u) => {
    document.body.innerHTML = '<video id="v" controls muted playsinline style="width:100%"></video>';
    const v = document.getElementById("v");
    window.__e = [];
    ["loadstart","loadedmetadata","canplay","playing","error","stalled","waiting","suspend","abort"].forEach((n) =>
      v.addEventListener(n, () => { if (window.__e.length < 30) window.__e.push(n); }));
    v.src = u;
    v.play().catch((e) => window.__e.push("play-отказ:" + e.name));
  }, url);
  for (const шаг of [8, 20, 32]) {
    await p.waitForTimeout(шаг === 8 ? 8000 : 12000);
    console.log(шаг + "с: " + JSON.stringify(await p.evaluate(() => {
      const v = document.getElementById("v");
      return { rs: v.readyState, t: +v.currentTime.toFixed(1), буф: v.buffered.length ? +v.buffered.end(0).toFixed(1) : 0,
               ошибка: v.error ? v.error.code + "/" + (v.error.message || "").slice(0, 50) : null, события: [...new Set(window.__e)].join(",") };
    })));
  }
  console.log("ответы прокси: " + JSON.stringify(ответы.slice(0, 6)));
  await b.close();
})();
