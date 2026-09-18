/** Играет ли окно Alloha по token_movie там, где по tmdb «контент не найден». */
const { chromium } = require("playwright");
const ОКНО = "https://player.sapkeflykino.ru/?token_movie=" + process.env.TM + "&token=" + process.env.TOK + "&season=1&episode=1";
(async () => {
  const b = await chromium.launch({ channel: "msedge" });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto("https://sapkeflykino.ru/tvapp/alloha.html?src=" + encodeURIComponent(ОКНО), { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(22000);
  const f = p.frames().find((x) => x.url().includes("player.sapkeflykino"));
  console.log("кадр: " + !!f);
  if (f) console.log("внутри: " + JSON.stringify(await f.evaluate(() => {
    const v = document.querySelector("video");
    return { видео: !!v, t: v ? +v.currentTime.toFixed(1) : null, текст: document.body.innerText.replace(/\s+/g, " ").slice(0, 120) };
  }).catch(() => "ERR")));
  await p.screenshot({ path: process.env.DIR + "/alloha-tm.png" });
  await b.close();
})();
