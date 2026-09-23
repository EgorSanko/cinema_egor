/** А: источник выбран заранее. Б: переключён кнопкой на открытой странице. */
const { chromium } = require("playwright");
const жми = async (p, что) => {
  await p.evaluate((т) => {
    const k = [...document.querySelectorAll("button")].find((b) => т === "watch" ? /^Смотреть/.test(b.innerText.trim()) : b.innerText.trim() === т);
    if (k) k.scrollIntoView({ block: "center" });
  }, что);
  await p.waitForTimeout(700);
  const c = await p.evaluate((т) => {
    const k = [...document.querySelectorAll("button")].find((b) => т === "watch" ? /^Смотреть/.test(b.innerText.trim()) : b.innerText.trim() === т);
    if (!k) return null;
    const r = k.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, что);
  if (c) await p.mouse.click(c.x, c.y);
  return !!c;
};
const состояние = (p) => p.evaluate(() => {
  const v = document.querySelector("video");
  return v ? { t: +v.currentTime.toFixed(1), буф: v.buffered.length ? +v.buffered.end(0).toFixed(1) : 0, rs: v.readyState, paused: v.paused } : { видео: "нет" };
});
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  for (const режим of ["А: заранее Плеер 2", "Б: переключение кнопкой"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const p = await ctx.newPage();
    let проксиЗапросов = 0;
    p.on("request", (r) => { if (/vkmovie\/proxy/.test(r.url())) проксиЗапросов++; });
    await p.goto("https://sapkeflykino.ru/", { waitUntil: "load" });
    await p.evaluate((зар) => {
      localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "s" }));
      if (зар) localStorage.setItem("kino_source", "vkmovie");
    }, режим.startsWith("А"));
    await p.goto("https://sapkeflykino.ru/movie/9654", { waitUntil: "load" });
    await p.waitForTimeout(8000);
    if (режим.startsWith("Б")) { await жми(p, "Плеер 2"); await p.waitForTimeout(10000); }
    await жми(p, "watch");
    await p.waitForTimeout(22000);
    console.log(режим + ": " + JSON.stringify(await состояние(p)) + " | запросов к потоку: " + проксиЗапросов);
    await ctx.close();
  }
  await b.close();
})();
