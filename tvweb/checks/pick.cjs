/** Выбор серии и запуск: что рисуется и что уходит в сеть. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const net = [], errs = [];
  page.on("request", (r) => { const u = r.url();
    if (/alloha-hls|hdrezka\/api|external_ids|tv-episodes/.test(u)) net.push(u.replace(/https:\/\/[^/]+/, "").split("&api")[0].slice(0, 60)); });
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 150)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 150)); });

  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/" + (process.argv[2] || "318354"), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(14000);

  const eps = await page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")];
    const e = btns.filter((b) => /Серия \d/.test(b.innerText));
    return { всего: e.length, первые: e.slice(0, 8).map((b) => b.innerText.replace(/\s+/g, " ").slice(0, 22)),
      спревью: e.filter((b) => b.querySelector("img")).length };
  });
  console.log("• серий: " + eps.всего + " с превью: " + eps.спревью);
  console.log("  " + JSON.stringify(eps.первые));
  await page.screenshot({ path: "pick.png" });

  net.length = 0;
  await page.keyboard.press("ArrowRight"); await page.waitForTimeout(1500);
  await page.keyboard.press("Enter");
  for (let i = 1; i <= 6; i++) {
    await page.waitForTimeout(6000);
    const v = await page.evaluate(() => { const x = [...document.querySelectorAll("video")].filter(v => v.currentSrc).pop();
      const t = document.body.innerText.replace(/\s+/g, " ");
      return x ? ("видео " + x.currentTime.toFixed(1) + "с") : t.slice(0, 70); });
    console.log("  " + i * 6 + "с → " + v);
  }
  console.log("\nушло в сеть: " + (net.length ? [...new Set(net)].join("  |  ") : "НИЧЕГО"));
  console.log("ошибки: " + (errs.length ? [...new Set(errs)].slice(0, 4).join(" | ") : "нет"));
  await browser.close();
})();
