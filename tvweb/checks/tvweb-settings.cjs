/** Путь до настроек в плеере: вниз → к кнопкам → шестерёнка → вкладки. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const step = (s) => console.log("• " + s);
const txt = (page) => page.evaluate(() => document.body.innerText.replace(/\s+/g, " "));
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 140)));
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  // С главной и «ОК» по первой карточке: прямой адрес тайтла может не иметь
  // источника, и обёртка честно возвращает на главную — проверять надо путь,
  // которым реально ходит человек.
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(11000);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(18000);
  let v = await page.evaluate(() => { const x = document.querySelector("video"); return x ? x.currentTime.toFixed(1) + "с" : "нет"; });
  step("плеер: " + v);

  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1500);
  step("вниз → панель управления показана");
  await page.keyboard.press("ArrowDown"); await page.waitForTimeout(1200);
  for (let i = 0; i < 2; i++) { await page.keyboard.press("ArrowRight"); await page.waitForTimeout(700); }
  await page.keyboard.press("Enter"); await page.waitForTimeout(2500);
  const t = await txt(page);
  step("после шестерёнки: " + t.slice(0, 240));
  step("вкладка «Качество»: " + /качеств/i.test(t) + " | «Озвучка»: " + /озвуч/i.test(t) + " | «Серии»: " + /сери/i.test(t));
  await page.screenshot({ path: "set-1.png" });

  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1800);
  step("вправо (озвучки): " + (await txt(page)).slice(0, 240));
  await page.screenshot({ path: "set-2.png" });
  console.log("\nОшибки: " + (errs.length ? errs.slice(0,5).join(" | ") : "нет"));
  await browser.close();
})();
