/** Kodik из России: браузер через туннель на РФ-сервер. */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge", proxy: { server: "socks5://127.0.0.1:1080" } });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto("https://sapkeflykino.ru/", { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.evaluate(() => {
    localStorage.setItem("kino_source", "kodik");
    localStorage.setItem("user", JSON.stringify({ email: "tv-selftest@sapkeflykino.ru", name: "selftest" }));
  });
  await p.goto("https://sapkeflykino.ru/tv/13916", { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(9000);
  const кн = p.locator('button:has-text("Смотреть"), button:has-text("Серия")').first();
  if (await кн.count()) await кн.click({ timeout: 8000 }).catch(() => {});
  else await p.mouse.click(640, 400);
  await p.waitForTimeout(22000);
  for (const f of p.frames()) {
    if (!f.url().includes("kodikplayer")) continue;
    console.log("окно: " + f.url().slice(0, 90));
    console.log("внутри: " + JSON.stringify(await f.evaluate(() => {
      const v = document.querySelector("video");
      return { видео: !!v, t: v ? +v.currentTime.toFixed(1) : null, текст: document.body.innerText.replace(/\s+/g, " ").slice(0, 130) };
    }).catch((e) => "ERR " + String(e).slice(0, 40))));
  }
  await p.screenshot({ path: process.env.DIR + "/kodik-ru.png" });
  await b.close();
})();
