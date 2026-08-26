/** Куда попадает пульт в выборе серии: печатаем подсвеченный элемент. */
const { chromium } = require("playwright");
const EMAIL = "tv-selftest@sapkeflykino.ru", PASS = process.env.TVPASS;
const выделено = (page) => page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => {
    const s = getComputedStyle(x);
    return s.boxShadow && s.boxShadow !== "none" && !/rgba\(0, 0, 0/.test(s.boxShadow.slice(0, 20));
  });
  return b ? b.innerText.replace(/\s+/g, " ").slice(0, 34) : "НИЧЕГО НЕ ПОДСВЕЧЕНО";
});
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const net = [];
  page.on("request", (r) => { if (/alloha-hls/.test(r.url())) net.push("запрос за видео"); });
  await page.goto("https://sapkeflykino.ru/tvweb/", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);
  await page.evaluate(async ([e, p]) => {
    const r = await fetch("/api/auth", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email: e, password: p }) });
    const d = await r.json(); if (d.user) localStorage.setItem("user", JSON.stringify(d.user));
  }, [EMAIL, PASS]);
  await page.goto("https://sapkeflykino.ru/tvweb/#/tv-watch/tv/318354", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(14000);
  console.log("старт           → " + await выделено(page));
  for (const k of ["ArrowRight", "ArrowRight", "ArrowDown", "Enter"]) {
    await page.keyboard.press(k); await page.waitForTimeout(2000);
    console.log(k.padEnd(15) + " → " + await выделено(page));
  }
  await page.waitForTimeout(9000);
  console.log("\nзапросов за видео: " + net.length);
  console.log("экран: " + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " "))).slice(0, 90));
  await browser.close();
})();
