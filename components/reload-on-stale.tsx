"use client";

import * as React from "react";

/**
 * Auto-reload tabs after deploys.
 *
 * Two triggers:
 * 1. Service Worker broadcasts {type: "SW_RELOAD"} when a new version activates
 *    (sent from public/sw.js on `activate` after caches are cleared).
 * 2. A failed JS chunk load (`ChunkLoadError` / dynamic import 404 / global
 *    error event with chunk URL) — happens when an old session refers to a
 *    chunk hash that no longer exists after deploy.
 *
 * In both cases we do a single forced reload (`location.reload()`), guarded by
 * sessionStorage so we never loop if the new build still throws.
 */
const RELOAD_FLAG = "kino_reloaded_after_deploy";

function reloadOnce(reason: string) {
  try {
    if (sessionStorage.getItem(RELOAD_FLAG)) return;
    sessionStorage.setItem(RELOAD_FLAG, reason);
  } catch {}
  // Use replace to drop history entry — and force a network fetch, not bfcache.
  setTimeout(() => location.reload(), 50);
}

export function ReloadOnStale() {
  // Опрос версии сборки — ГЛАВНЫЙ механизм автообновления. Триггеры ниже (SW и
  // ChunkLoadError) ненадёжны: SW считается новым только если поменялись его
  // байты, а его версия прописана руками и при деплое не менялась — поэтому
  // открытая вкладка жила со старым JS, пока юзер сам не сделает Ctrl+Shift+R.
  // Теперь: запоминаем версию при загрузке, проверяем раз в минуту и при
  // возврате на вкладку; изменилась — перезагружаемся сами.
  React.useEffect(() => {
    let mine = "";
    let stop = false;
    const check = async (first = false) => {
      if (stop) return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        if (!r.ok) return;
        const { v } = await r.json();
        if (!v) return;
        if (first || !mine) { mine = v; return; }
        if (v !== mine) {
          // Не дёргаем страницу под видео: если идёт воспроизведение, ждём
          // паузы/ухода со вкладки, иначе прервём просмотр на ровном месте.
          const vid = document.querySelector("video");
          if (vid && !vid.paused && !document.hidden) return;
          location.reload();
        }
      } catch {}
    };
    check(true);
    const iv = setInterval(() => check(), 60000);
    const onVis = () => { if (!document.hidden) check(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { stop = true; clearInterval(iv); document.removeEventListener("visibilitychange", onVis); };
  }, []);

  React.useEffect(() => {
    // Clear the guard after a successful initial render (5s) so a SECOND
    // future deploy can still trigger reload in the same tab.
    const clearGuard = setTimeout(() => {
      try { sessionStorage.removeItem(RELOAD_FLAG); } catch {}
    }, 5000);

    // Listen for SW broadcasts
    const onSwMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "SW_RELOAD") reloadOnce("sw-message");
    };
    navigator.serviceWorker?.addEventListener?.("message", onSwMessage);

    // Catch ChunkLoadError from Webpack/Turbopack/Next.js — covers a wider
    // set of patterns now: dynamic import 404, RSC payload mismatch, "Minified
    // React error #423" (hydration recovery fail), and any direct 404 on
    // `_next/static/`. After a deploy old tabs hit all of these.
    const looksLikeStaleBundle = (text: string, filename = ""): boolean => {
      const t = (text || "").toLowerCase();
      return (
        t.includes("loading chunk") ||
        t.includes("chunkloaderror") ||
        t.includes("loading css chunk") ||
        t.includes("failed to fetch dynamically imported module") ||
        t.includes("importing a module script failed") ||
        t.includes("script.js") && t.includes("404") ||
        /\/_next\/static\/.+\.(?:js|css)/.test(filename)
      );
    };
    const onErr = (e: ErrorEvent) => {
      if (looksLikeStaleBundle(String(e?.message || ""), String(e?.filename || ""))) {
        reloadOnce("chunk-load");
      }
    };
    const onUnhandled = (e: PromiseRejectionEvent) => {
      const r: any = e?.reason;
      const msg = String(r?.message || r || "");
      if (looksLikeStaleBundle(msg)) reloadOnce("chunk-load-promise");
    };
    // Also detect 404 on _next/static/* — sometimes the error is swallowed
    // by Next.js's loader before our `error` listener sees it.
    const origFetch = window.fetch;
    window.fetch = function patchedFetch(input: any, init?: any) {
      return origFetch.call(this, input, init).then((res) => {
        try {
          const u = typeof input === "string" ? input : input?.url || "";
          if (res.status === 404 && /\/_next\/static\/.+\.(?:js|css)/.test(u)) {
            reloadOnce("static-404");
          }
        } catch {}
        return res;
      });
    };
    window.addEventListener("error", onErr);
    window.addEventListener("unhandledrejection", onUnhandled);

    return () => {
      clearTimeout(clearGuard);
      navigator.serviceWorker?.removeEventListener?.("message", onSwMessage);
      window.removeEventListener("error", onErr);
      window.removeEventListener("unhandledrejection", onUnhandled);
      window.fetch = origFetch;
    };
  }, []);

  return null;
}
