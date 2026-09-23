/** Перехват play()/load(): вызываются ли они и чем заканчиваются. */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    window.__log = [];
    const t0 = Date.now();
    const origPlay = HTMLMediaElement.prototype.play;
    const origLoad = HTMLMediaElement.prototype.load;
    HTMLMediaElement.prototype.play = function () {
      const i = window.__log.length;
      window.__log.push({ с: ((Date.now() - t0) / 1000).toFixed(1), что: "play", rs: this.readyState, muted: this.muted, итог: "ждём" });
      let p;
      try { p = origPlay.apply(this, arguments); } catch (e) { window.__log[i].итог = "бросил " + e.name; throw e; }
      if (p && p.then) p.then(() => { window.__log[i].итог = "пошло"; }).catch((e) => { window.__log[i].итог = "отказ " + e.name; });
      return p;
    };
    HTMLMediaElement.prototype.load = function () {
      window.__log.push({ с: ((Date.now() - t0) / 1000).toFixed(1), что: "load", rs: this.readyState });
      return origLoad.apply(this, arguments);
    };
  });
  const p = await ctx.newPage();
  await p.goto("https://sapkeflykino.ru/", { waitUntil: "domcontentloaded" });
  await p.evaluate(() => {
    localStorage.setItem("kino_source", "vkmovie");
    localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" }));
  });
  await p.goto("https://sapkeflykino.ru/movie/9654", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(7000);
  const кн = p.locator("button").filter({ hasText: /^Смотреть|Продолжить/ }).first();
  if (await кн.count()) await кн.click({ timeout: 8000 }).catch(() => {});
  await p.waitForTimeout(25000);
  console.log("вызовы:\n" + JSON.stringify(await p.evaluate(() => window.__log), null, 1).slice(0, 1200));
  console.log("итог video: " + JSON.stringify(await p.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { rs: v.readyState, ns: v.networkState, paused: v.paused, muted: v.muted, src: (v.currentSrc || "").slice(0, 45) } : null;
  })));
  await b.close();
})();
