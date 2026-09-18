/** Kodik из России: доходит ли до воспроизведения (с нажатием внутри их окна). */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge", proxy: { server: "socks5://127.0.0.1:1080" } });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  await p.goto("https://sapkeflykino.ru/tvapp/alloha.html?x=1", { waitUntil: "domcontentloaded", timeout: 90000 }).catch(() => {});
  // Открываем окно Kodik напрямую (как его вставляет сайт), чтобы клики шли в него.
  await p.goto("https://kodikplayer.com/serial/7963/c916cb3061f744693ec4ccabe009bdd0/720p?season=1&episode=1",
    { waitUntil: "domcontentloaded", timeout: 90000 });
  await p.waitForTimeout(8000);
  const текст1 = await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 120));
  console.log("сразу: " + текст1);
  // Подтверждение возраста / запуск
  for (const п of ["Продолжить", "Мне есть", "Да", "Смотреть"]) {
    const л = p.locator(`text=${п}`).first();
    if (await л.count()) { await л.click({ timeout: 5000 }).catch(() => {}); console.log("нажал: " + п); break; }
  }
  await p.waitForTimeout(3000);
  await p.mouse.click(640, 360);
  await p.waitForTimeout(20000);
  console.log("видео: " + JSON.stringify(await p.evaluate(() => {
    const v = document.querySelector("video");
    return v ? { t: +v.currentTime.toFixed(1), paused: v.paused, dur: Math.round(v.duration || 0), src: (v.currentSrc || "").slice(0, 50) }
             : { нет: document.body.innerText.replace(/\s+/g, " ").slice(0, 120) };
  })));
  await p.screenshot({ path: process.env.DIR + "/kodik-ru2.png" });
  await b.close();
})();
