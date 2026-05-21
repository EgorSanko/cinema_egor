"use client";

import { useEffect } from "react";

/**
 * Next.js global error boundary. Triggers when an unrecoverable error escapes
 * the app — most commonly a ChunkLoadError after a deploy (cached HTML in the
 * tab references chunks the server no longer has). Instead of showing the
 * "Oops! Something went wrong" page, force-reload once to pick up the fresh
 * bundle. Guarded by sessionStorage so we don't loop if the new build is also
 * broken — in that case fall through to a manual retry button.
 */
const RELOAD_FLAG = "kino_globalerror_reloaded";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    let alreadyReloaded = false;
    try { alreadyReloaded = !!sessionStorage.getItem(RELOAD_FLAG); } catch {}

    if (!alreadyReloaded) {
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
      // Already reloaded once and still failing — let the manual screen show.
      // Clear the flag after a moment so future deploys can retry.
      const t = setTimeout(() => {
        try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
      }, 30_000);
      return () => clearTimeout(t);
    }
  }, []);

  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#0f1419", color: "#e4e6eb", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32, textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: 32, background: "rgba(163, 230, 53, 0.12)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, border: "3px solid #a3e635", borderTopColor: "transparent", animation: "spin 1s linear infinite" }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: "0 0 8px" }}>Обновление сайта</h1>
          <p style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", maxWidth: 380, lineHeight: 1.5, margin: 0 }}>
            Загружаю свежую версию. Если страница не вернулась автоматически — нажмите кнопку ниже.
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
