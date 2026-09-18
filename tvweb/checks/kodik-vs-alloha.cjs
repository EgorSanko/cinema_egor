/** /tv/13916: что показывают Плеер 1 (Alloha) и Плеер 5 (Kodik). */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  for (const источник of ["alloha", "kodik"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    await p.goto("https://sapkeflykino.ru/", { waitUntil: "domcontentloaded" });
    await p.evaluate((s) => localStorage.setItem("kino_source", s), источник);
    await p.goto("https://sapkeflykino.ru/tv/13916", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(18000);
    const кадры = p.frames().map((f) => f.url()).filter((u) => /kodikplayer|player\.sapkeflykino/.test(u));
    console.log("— " + источник + " — кадров: " + кадры.length + (кадры[0] ? " → " + кадры[0].replace(/token=[^&]+/, "token=…").slice(0, 95) : ""));
    for (const f of p.frames()) {
      if (!/kodikplayer|player\.sapkeflykino/.test(f.url())) continue;
      const что = await f.evaluate(() => {
        const v = document.querySelector("video");
        return { видео: !!v, время: v ? +v.currentTime.toFixed(1) : null, текст: document.body.innerText.replace(/\s+/g, " ").slice(0, 110) };
      }).catch((e) => "ERR " + String(e).slice(0, 50));
      console.log("   внутри: " + JSON.stringify(что));
    }
    const ошибка = await p.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/Нет на Плеер[^.]*\.|Недоступно[^.]*\.|не отдал[^.]*\./);
      return m ? m[0] : null;
    });
    console.log("   сообщение страницы: " + (ошибка || "нет"));
    await p.screenshot({ path: process.env.DIR + "/" + источник + ".png" });
    await ctx.close();
  }
  await b.close();
})();
