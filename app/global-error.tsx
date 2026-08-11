"use client";

import { useEffect, useState } from "react";

/**
 * Next.js global error boundary. Triggers when an unrecoverable error escapes
 * the app — most commonly a ChunkLoadError after a deploy (cached HTML in the
 * tab references chunks the server no longer has). В этом случае перезагрузка
 * оправдана: свежий бандл чинит проблему.
 *
 * ВАЖНО, откуда взялась проверка `looksStale`. Раньше здесь перезагружалась
 * ЛЮБАЯ ошибка React — и это был главный источник жалобы «смотрю фильм, и
 * страница ни с того ни с сего обновляется». Причём совершенно незаметно для
 * нас: ошибку, пойманную границей React, браузер НЕ отдаёт в window.onerror,
 * поэтому наша ловушка ошибок не присылала ничего, а в логах виднелась просто
 * ещё одна загрузка страницы. Теперь обычная ошибка никого не выкидывает из
 * фильма: показываем экран с кнопкой и присылаем себе текст ошибки.
 */
const RELOAD_FLAG = "kino_globalerror_reloaded";

/** Похоже ли на «в браузере старый бандл, а на сервере уже новый». */
function looksStale(err: any): boolean {
  const t = String(err?.message || err || "").toLowerCase();
  return (
    t.includes("loading chunk") ||
    t.includes("chunkloaderror") ||
    t.includes("loading css chunk") ||
    t.includes("dynamically imported module") ||
    t.includes("importing a module script failed")
  );
}

/** Идёт ли просмотр — из фильма не выдёргиваем даже ради свежего кода. */
function isWatching(): boolean {
  try {
    return Array.from(document.querySelectorAll("video")).some(
      (v) => !v.paused && !v.ended && v.currentTime > 0 && v.readyState > 2,
    );
  } catch {
    return false;
  }
}

/** Отправить текст ошибки себе в лог картинкой — переживает любые блокировки. */
function report(err: any) {
  try {
    const m = `boundary: ${String(err?.message || err).slice(0, 200)}`;
    const x = String(err?.digest || err?.stack || "").slice(0, 120);
    const i = new Image();
    i.src = `/tv-error?m=${encodeURIComponent(m)}&x=${encodeURIComponent(x)}`;
  } catch {}
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Пока не решили — показываем нейтральный экран; «Обновление сайта» пишем
  // только когда действительно идём на перезагрузку.
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    report(error);

    let alreadyReloaded = false;
    try { alreadyReloaded = !!sessionStorage.getItem(RELOAD_FLAG); } catch {}

    if (!alreadyReloaded && looksStale(error) && !isWatching()) {
      setReloading(true);
      try { sessionStorage.setItem(RELOAD_FLAG, String(Date.now())); } catch {}
      // Drop CACHE entries proactively so the reload pulls truly fresh assets
      // (otherwise SW cache-first would re-serve broken chunks).
      (async () => {
        try {
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        } catch {}
        location.reload();
      })();
    } else {
      // Либо уже перезагружались, либо ошибка не про старый бандл — в обоих
      // случаях показываем экран с кнопкой, решение за человеком.
      const t = setTimeout(() => {
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
      }, 30_000);
      return () => clearTimeout(t);
    }
  }, [error]);

  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#0f1419", color: "#e4e6eb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(163, 230, 53, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, border: "3px solid #a3e635", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>
            {reloading ? "Обновление сайта" : "Страница не открылась"}
          </h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 380, lineHeight: 1.5, margin: 0 }}>
            {reloading
              ? "Загружаю свежую версию. Если страница не вернулась автоматически — нажмите кнопку ниже."
              : "Сбой на нашей стороне, мы уже получили отчёт. Нажмите кнопку — обычно всё встаёт на место."}
          </p>
          <button
            onClick={() => { try { sessionStorage.removeItem(RELOAD_FLAG); } catch {} ; reset(); location.reload(); }}
            style={{ marginTop: 24, padding: "10px 24px", borderRadius: 24, background: "#a3e635", color: "#0f1419", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Перезагрузить
          </button>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </body>
    </html>
  );
}
