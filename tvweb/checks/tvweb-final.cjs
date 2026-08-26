/**
 * ИТОГОВАЯ ОБКАТКА. Один прогон: стартовый параметр MSX → обёртка → вход →
 * главная → пульт → фильм играет. Ровно тот путь, которым идёт человек.
 */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
let fails = 0;
const ok = (name, good, detail) => { if (!good) fails++; console.log((good ? "  ДА  " : "  НЕТ ") + name + (detail ? " — " + detail : "")); };

(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 120)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 120)); });

  console.log("\n1. СТАРТОВЫЙ ПАРАМЕТР MSX");
  await page.goto("https://msx.benzac.de/?start=content:https://sapkeflykino.ru/msx/launch.json", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(12000);
  const body1 = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("без предупреждения о ссылке", !/Link Validation|press continue/i.test(body1));
  const tv = ctx.pages().find((p) => p.url().includes("/tvweb/"));
  ok("обёртка открылась сама", !!tv, tv ? tv.url().split("?")[0] : "не открылась");
  if (!tv) { console.log("\nИТОГ: цепочка оборвалась"); await browser.close(); process.exit(1); }
  await tv.waitForTimeout(9000);

  console.log("\n2. ОБЁРТКА");
  ok("метка против старой копии", /[?&]t=/.test(tv.url()));
  let t = (await tv.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("экран нарисован", t.length > 40, t.slice(0, 60));
  ok("не висит на загрузке", !/Готовлю подборки|Загружаю подборки/i.test(t));

  console.log("\n3. ВХОД И ГЛАВНАЯ");
  await tv.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  // БЕЗ хвоста адреса: в нём остаётся экран входа, и после перезагрузки фокус
  // попадает на цифру экранной клавиатуры, а не на карточку фильма.
  await tv.goto(tv.url().split("#")[0], { waitUntil: "domcontentloaded" });
  await tv.waitForTimeout(12000);
  t = (await tv.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  ok("подборки загрузились", /подборок: [1-9]/.test(t), (t.match(/подборок: \d+/) || [""])[0]);
  const foc = await tv.evaluate(() => (document.activeElement?.innerText || "").replace(/\s+/g, " ").slice(0, 30));
  ok("видно, где пульт", !!foc, foc);

  console.log("\n4. ПУЛЬТ И ПЛЕЕР");
  await tv.keyboard.press("Enter");
  let played = 0, first = null;
  for (let i = 0; i < 16; i++) {
    await tv.waitForTimeout(6000);
    const v = await tv.evaluate(() => {
      const vs = [...document.querySelectorAll("video")].filter((x) => x.currentSrc);
      if (!vs.length) return null;
      const m = vs[vs.length - 1];
      return { t: m.currentTime, ad: /РЕКЛАМА/i.test(document.body.innerText) };
    });
    if (v && !v.ad) { if (first === null) first = v.t; played = v.t; }
  }
  ok("фильм играет", played > 5 && played > (first || 0), "доиграл до " + played.toFixed(1) + "с");
  await tv.screenshot({ path: "final.png" });

  console.log("\n5. ОШИБКИ");
  const uniq = [...new Set(errs)];
  ok("ошибок нет", uniq.length === 0, uniq.slice(0, 4).join(" | "));

  console.log("\n" + (fails ? "ИТОГ: провалов " + fails : "ИТОГ: ВСЯ ЦЕПОЧКА ПРОШЛА"));
  await browser.close();
  process.exit(fails ? 1 : 0);
})();
