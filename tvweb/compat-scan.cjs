/**
 * Что из собранного не переварит движок телевизора (Tizen 5 = Chromium 63).
 * Синтаксис уже проверен разбором по ES5 — здесь ищем ВОЗМОЖНОСТИ: методы и
 * свойства оформления, появившиеся позже, и не покрытые полифилами.
 */
const fs = require("fs"), path = require("path");
const dir = path.join(__dirname, "dist", "assets");
const js = fs.readdirSync(dir).filter((f) => f.endsWith(".js"))
  .map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
const html = fs.readFileSync(path.join(__dirname, "dist", "index.html"), "utf8");
const css = (html.match(/<style>([\s\S]*?)<\/style>/) || ["", ""])[1];

// Возможности JS с версией Chrome, в которой они появились. 63 — наш потолок.
const JSAPI = [
  ["Object.fromEntries", 73], ["\.flatMap\(", 69], ["\.flat\(", 69],
  ["Promise.allSettled", 76], ["globalThis", 71], ["structuredClone", 98],
  ["queueMicrotask", 71], ["\.replaceAll\(", 85], ["\.at\(", 92],
  ["ResizeObserver", 64], ["IntersectionObserver", 51], ["AbortController", 66],
  ["BigInt", 67], ["\.matchAll\(", 73], ["Array.from", 45],
];
const CSSAPI = [
  ["color-mix\(", 111], ["oklch\(", 111], ["@layer", 99], [":has\(", 105],
  ["@container", 105], ["inset:", 87], ["aspect-ratio", 88], ["gap:", 84],
  ["clamp\(", 79], ["backdrop-filter", 76], ["position:\s*sticky", 56],
  ["--[a-z-]+:", 49], ["min\(", 79], ["max\(", 79],
];
let bad = 0;
const scan = (label, text, list) => {
  console.log("\n" + label);
  list.forEach(([pat, since]) => {
    const re = new RegExp(pat, "g");
    const n = (text.match(re) || []).length;
    if (!n) return;
    const risky = since > 63;
    if (risky) bad++;
    console.log("  " + (risky ? "!! " : "   ") + pat.replace(/\\/g, "") +
      "  ×" + n + "  (с Chrome " + since + ")" + (risky ? "  ← ТЕЛЕВИЗОР НЕ УМЕЕТ" : ""));
  });
};
scan("КОД:", js, JSAPI);
scan("ОФОРМЛЕНИЕ (вшито в страницу, " + css.length + " байт):", css, CSSAPI);
console.log("\n" + (bad ? "НАЙДЕНО ОПАСНОГО: " + bad : "Опасного не найдено"));
