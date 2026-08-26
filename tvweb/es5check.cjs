// Разбираем собранные файлы строго как ES5. Если разбор проходит — ни один
// движок с 2016 года не выдаст «Unexpected token», то есть та самая ошибка,
// на которой телевизор Егора падал, повториться не может.
const fs = require("fs"), path = require("path"), acorn = require("acorn");
const dir = path.join(process.cwd(), "dist", "assets");
let bad = 0;
for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".js"))) {
  const src = fs.readFileSync(path.join(dir, f), "utf8");
  try {
    acorn.parse(src, { ecmaVersion: 5 });
    console.log("OK   " + f + "  (" + src.length + " байт)");
  } catch (e) {
    bad++;
    const at = Math.max(0, (e.pos || 0) - 90);
    console.log("СБОЙ " + f + "  " + e.message);
    console.log("     …" + src.slice(at, (e.pos || 0) + 90).replace(/\n/g, " ") + "…");
  }
}
// Тот же разбор для встроенного скрипта проверки на самой странице.
const html = fs.readFileSync(path.join(process.cwd(), "dist", "index.html"), "utf8");
const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
inline.forEach((code, i) => {
  if (!code.trim()) return;
  try { acorn.parse(code, { ecmaVersion: 5 }); console.log("OK   встроенный скрипт #" + (i + 1)); }
  catch (e) { bad++; console.log("СБОЙ встроенный скрипт #" + (i + 1) + ": " + e.message); }
});
console.log(bad ? "\nИТОГ: есть проблемы — " + bad : "\nИТОГ: чисто, всё разбирается как ES5");
process.exit(bad ? 1 : 0);
