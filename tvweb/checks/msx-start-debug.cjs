const { chromium } = require("playwright");
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const ev = [];
  page.on("framenavigated", (f) => { if (f === page.mainFrame()) ev.push("NAV " + f.url().slice(0, 110)); });
  ctx.on("request", (r) => { const u = r.url(); if (/feed\.json|msx-alloha|player\.sapkeflykino|start\.json|launch\.json/.test(u)) ev.push("REQ " + u.replace(/token%3D[0-9a-f]+/, "token=…").slice(0, 150)); });
  const feed = "https://sapkeflykino.ru/msx/feed.json?view=alloha&id=318354&type=tv&season=1&episode=1&title=%D0%A5%D0%BE%D0%BB%D0%BE%D0%B4";
  await page.goto("https://msx.benzac.de/?start=" + encodeURIComponent("content:" + feed), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(20000);
  ev.push("frames: " + page.frames().map((f) => f.url().slice(0, 70)).join(" ; "));
  ev.push("text: " + (await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 200))));
  console.log(ev.join("\n"));
  await page.screenshot({ path: process.env.SHOT });
  await browser.close();
})();
