const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const src = "https://player.sapkeflykino.ru/?tmdb=318354&type=serial&season=1&episode=1&autoplay=1&token=" + process.env.ALLOHA_TOKEN;
  const plugin = "video:plugin:https://sapkeflykino.ru/tvapp/msx-alloha.html?src=" + encodeURIComponent(src);
  const base = { type: "list", headline: "Холод", items: [{ title: "Смотреть", action: plugin }, { title: "Вернуться", action: "link:https://example.org/" }] };
  const variants = {
    A_root_action: { ...base, action: plugin },
    B_ready_action: { ...base, ready: { action: plugin } },
    C_enter_item: base,
  };
  for (const [name, json] of Object.entries(variants)) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const url = "https://sapkeflykino.ru/__msxtest_" + name + ".json";
    await ctx.route(url + "*", (r) => r.fulfill({ contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*" }, body: JSON.stringify(json) }));
    const page = await ctx.newPage();
    const navs = [];
    page.on("framenavigated", (f) => { if (f === page.mainFrame()) navs.push(f.url().slice(0, 60)); });
    await page.goto("https://msx.benzac.de/?start=" + encodeURIComponent("content:" + url), { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12000);
    if (name === "C_enter_item") { await page.keyboard.press("Enter"); await page.waitForTimeout(10000); }
    const fr = page.frames().map((f) => f.url()).filter((u) => /msx-alloha|player\.sapkeflykino/.test(u)).map((u) => u.slice(0, 50));
    const al = page.frames().find((f) => f.url().startsWith("https://player.sapkeflykino.ru"));
    const v = al ? await al.evaluate(() => { const x = document.querySelector("video"); return x ? { t: +x.currentTime.toFixed(1), paused: x.paused, muted: x.muted } : null; }).catch(() => "ERR") : null;
    let back = null;
    if (al) { await page.keyboard.press("Escape"); await page.waitForTimeout(3000); back = !page.frames().some((f) => /msx-alloha/.test(f.url())); }
    console.log(name, "| navs:", navs.join(" -> "), "| frames:", JSON.stringify(fr), "| video:", JSON.stringify(v), "| закрылся по Esc:", back);
    await ctx.close();
  }
  await browser.close();
})();
