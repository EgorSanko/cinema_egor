const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  for (const источник of ["alloha", "kodik"]) {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    await p.goto("https://sapkeflykino.ru/", { waitUntil: "domcontentloaded" });
    await p.evaluate((s) => {
      localStorage.setItem("kino_source", s);
      localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" }));
    }, источник);
    await p.goto("https://sapkeflykino.ru/tv/13916", { waitUntil: "domcontentloaded" });
    await p.waitForTimeout(9000);
    console.log("\n──── " + источник + " ────");
    console.log("текст: " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 260))));
    // Кнопка запуска: пробуем «Смотреть»/play
    const кн = p.locator('button:has-text("Смотреть"), button[aria-label*="play" i], .play-button, button:has-text("Серия")').first();
    if (await кн.count()) { await кн.click({ timeout: 8000 }).catch(() => {}); console.log("нажал запуск"); }
    else { await p.mouse.click(640, 400); console.log("клик по центру"); }
    await p.waitForTimeout(20000);
    const кадры = p.frames().map((f) => f.url()).filter((u) => /kodikplayer|player\.sapkeflykino/.test(u));
    console.log("кадров: " + кадры.length + (кадры[0] ? " → " + кадры[0].replace(/token=[^&]+/, "token=…").slice(0, 100) : ""));
    for (const f of p.frames()) {
      if (!/kodikplayer|player\.sapkeflykino/.test(f.url())) continue;
      console.log("внутри: " + JSON.stringify(await f.evaluate(() => {
        const v = document.querySelector("video");
        return { видео: !!v, t: v ? +v.currentTime.toFixed(1) : null, текст: document.body.innerText.replace(/\s+/g, " ").slice(0, 90) };
      }).catch((e) => "ERR")));
    }
    console.log("страница: " + (await p.evaluate(() => { const m = document.body.innerText.match(/Нет на Плеер[^.]*|Недоступно[^.]*|не отдал[^.]*/); return m ? m[0] : "без сообщений"; })));
    await p.screenshot({ path: process.env.DIR + "/" + источник + "2.png" });
    await ctx.close();
  }
  await b.close();
})();
