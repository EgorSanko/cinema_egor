// Штампует sw.js версией билда (CACHE_NAME) → файл меняется КАЖДЫЙ деплой →
// сервис-воркер переактивируется и шлёт SW_RELOAD → открытые вкладки сами
// перезагружаются на свежий код. Без этого статичный sw.js не переустанавливался,
// и старый бандл жил в кэше вечно (отсюда «на устройстве старая версия»).
// Запускается как postbuild. НИКОГДА не роняем билд: все ошибки глотаем, exit 0.
import fs from "fs";
import path from "path";

const stamp = "b" + Date.now();

function findSw(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === "node_modules" || e.name.startsWith(".git")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findSw(p, out);
    else if (e.name === "sw.js") out.push(p);
  }
  return out;
}

try {
  const targets = new Set(["public/sw.js"]);
  findSw(".next/standalone", []).forEach((f) => targets.add(f));
  let n = 0;
  for (const f of targets) {
    try {
      let s = fs.readFileSync(f, "utf8");
      if (s.includes("CACHE_NAME")) {
        s = s.replace(/const CACHE_NAME = "[^"]*"/, `const CACHE_NAME = "kino-${stamp}"`);
        fs.writeFileSync(f, s);
        n++;
      }
    } catch { /* конкретный файл пропускаем */ }
  }
  console.log(`[stamp-sw] stamped ${n} sw.js → kino-${stamp}`);
} catch (e) {
  console.log("[stamp-sw] skipped:", (e && e.message) || e);
}
process.exit(0);
