/** Лёгкий клиент, Samsung: вход, тайтл, запуск — идут ли куски видео. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 },
    userAgent: "Mozilla/5.0 (SMART-TV; LINUX; Tizen 5.0) AppleWebKit/537.36 Chrome/63.0.3239.84 TV Safari/537.36" });
  const p = await ctx.newPage();
  const сеть = [];
  p.on("request", (r) => { const u = r.url();
    if (/alloha-hls|alloha\.m3u8|alloha\/seg/.test(u)) сеть.push(u.split("?")[0].replace(/https:\/\/[^/]+/, "")); });
  const errs = [];
  p.on("pageerror", (e) => errs.push(String(e).slice(0, 130)));

  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(4000);
  await p.evaluate(async ([e, pw]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: pw }) });
    const d = await r.json();
    if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await p.goto("https://sapkeflykino.ru/tvapp/", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(9000);
  console.log("1. экран: " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 70))));

  // Открываем первую карточку напрямую — она уже в фокусе.
  await p.locator(".card").first().click();
  await p.waitForTimeout(6000);
  console.log("2. экран тайтла: " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 110))));
  // Запуск: жмём ОК на выбранном (кнопка «Смотреть» или первая серия)
  await p.keyboard.press("Enter");
  await p.waitForTimeout(4000);
  console.log("3. после запуска: " + (await p.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 110))));
  for (let i = 1; i <= 6; i++) {
    await p.waitForTimeout(5000);
    const v = await p.evaluate(() => { const x = document.querySelector("video");
      return x ? { t: +(x.currentTime || 0).toFixed(1), src: !!x.currentSrc, пауза: x.paused } : null; });
    console.log("   " + i * 5 + "с → " + JSON.stringify(v));
  }
  console.log("\nсеть: " + [...new Set(сеть)].join("  |  "));
  console.log("кусков видео запрошено: " + сеть.filter((u) => u.includes("/seg")).length);
  console.log("ошибки: " + (errs.length ? [...new Set(errs)].slice(0, 3).join(" | ") : "нет"));
  await browser.close();
})();
