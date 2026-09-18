/** Kodik из России на нашей странице: доходит ли до видео. */
const { chromium } = require("playwright");
(async () => {
  const b = await chromium.launch({ channel: "msedge", proxy: { server: "socks5://127.0.0.1:1080" } });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
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
  await p.waitForTimeout(15000);
  const f = p.frames().find((x) => x.url().includes("kodikplayer"));
  if (!f) { console.log("окна нет"); await b.close(); return; }
  const состояние = async (метка) => {
    const s = await f.evaluate(() => {
      const v = document.querySelector("video");
      return v ? { видео: true, t: +v.currentTime.toFixed(1), paused: v.paused, dur: Math.round(v.duration || 0) }
               : { видео: false, текст: document.body.innerText.replace(/\s+/g, " ").slice(0, 90) };
    }).catch((e) => "ERR");
    console.log(метка + ": " + JSON.stringify(s));
  };
  await состояние("до нажатий");
  for (const п of ["Мне есть 18", "Продолжить", "Да", "1 серия"]) {
    const л = f.locator(`text=${п}`).first();
    if (await л.count()) { await л.click({ timeout: 6000 }).catch(() => {}); console.log("нажал внутри: " + п); await p.waitForTimeout(3000); }
  }
  const бокс = await p.locator("iframe").first().boundingBox();
  if (бокс) { await p.mouse.click(бокс.x + бокс.width / 2, бокс.y + бокс.height / 2); console.log("клик по центру окна"); }
  await p.waitForTimeout(22000);
  await состояние("после нажатий");
  await p.screenshot({ path: process.env.DIR + "/kodik-ru3.png" });
  await b.close();
})();
