import fs from "fs";
import path from "path";

// Версия текущей сборки — по ней открытые вкладки понимают, что вышел деплой,
// и перезагружаются САМИ. Раньше этого не было: автообновление висело на
// service worker, а его версия (CACHE_NAME) прописана в коде руками и при
// деплое не менялась → браузер не считал SW новым, вкладка жила со старым JS,
// и приходилось вручную жать Ctrl+Shift+R.
//
// BUILD_ID меняется на каждой сборке. Если файла нет (dev) — берём момент
// старта процесса: деплой всё равно перезапускает pm2, значит значение новое.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let VERSION = "";
try {
  VERSION = fs.readFileSync(path.join(process.cwd(), ".next", "BUILD_ID"), "utf8").trim();
} catch {}
if (!VERSION) VERSION = String(Date.now());

export async function GET() {
  return new Response(JSON.stringify({ v: VERSION }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
