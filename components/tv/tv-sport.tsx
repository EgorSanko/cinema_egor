"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Hls from "hls.js";
import { getTvUser } from "@/lib/tv-auth";
import { useTvPro } from "@/hooks/use-tv-pro";
import { fetchChannels, type SportChannel } from "@/lib/kinopub";

// ════════════════════════════════════════════════════════════════
// TV «Спорт» — прямой эфир спортивных каналов, ТОЛЬКО для Про.
// 10-foot UI, полностью на пульте (D-pad). Два режима:
//   grid  — сетка каналов (стрелки — фокус, OK — включить, Назад — домой)
//   play  — полноэкранный плеер (OK — пауза/играть, Назад — вернуться к сетке)
// Каналы = raw m3u8 (fetchChannels), их отдаёт residential-IP браузера напрямую;
// hls.js играет так же, как сайтовая /sport.
// ════════════════════════════════════════════════════════════════

const COLS = 5; // столбцов в сетке (крупные плитки, читаемо с дивана)

export function TvSport() {
  const router = useRouter();

  // ── Гейты: сначала вход, затем Про ──
  const [authed, setAuthed] = useState(false);
  const { isPro, loading: subLoading } = useTvPro();

  useEffect(() => {
    if (!getTvUser()) { router.replace("/tv-login"); return; }
    setAuthed(true);
  }, [router]);

  // ── Данные ──
  const [channels, setChannels] = useState<SportChannel[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!authed || subLoading || !isPro) { if (!subLoading) setLoading(false); return; }
    let alive = true;
    (async () => {
      const list = await fetchChannels();
      if (alive) { setChannels(list); setLoading(false); }
    })();
    return () => { alive = false; };
  }, [authed, isPro, subLoading]);

  // ── Фокус в сетке + режим ──
  const [focus, setFocus] = useState(0);
  const [mode, setMode] = useState<"grid" | "play">("grid");
  const [playIdx, setPlayIdx] = useState(0);
  const cellRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [paused, setPaused] = useState(false);

  const play = useCallback((idx: number) => {
    if (idx < 0 || idx >= channels.length) return;
    setPlayIdx(idx);
    setMode("play");
  }, [channels.length]);

  // ── HLS загрузка выбранного канала (live, без resume/seek) ──
  useEffect(() => {
    if (mode !== "play") return;
    const ch = channels[playIdx];
    const v = videoRef.current;
    if (!ch?.stream || !v) return;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (ch.stream.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(ch.stream);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { v.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
      });
    } else {
      v.src = ch.stream;
      v.onloadedmetadata = () => { v.play().catch(() => {}); };
    }
    setPaused(false);
    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
  }, [mode, playIdx, channels]);

  // ── Клавиатура/пульт ──
  useEffect(() => {
    if (!authed) return;
    const handler = (e: KeyboardEvent) => {
      const k = e.key, c = e.keyCode;
      const isLeft = k === "ArrowLeft" || c === 37;
      const isUp = k === "ArrowUp" || c === 38;
      const isRight = k === "ArrowRight" || c === 39;
      const isDown = k === "ArrowDown" || c === 40;
      const isEnter = k === "Enter" || c === 13;
      const isSpace = k === " " || k === "Spacebar" || c === 32;
      const isPlayPause = c === 179 || c === 85 || k === "MediaPlayPause";
      const isBack = k === "Escape" || k === "Backspace" || c === 27 || c === 8 || c === 461 || c === 10009;
      if (!isLeft && !isUp && !isRight && !isDown && !isEnter && !isSpace && !isPlayPause && !isBack) return;
      e.preventDefault();

      // ── Плеер ──
      if (mode === "play") {
        if (isBack) { setMode("grid"); return; }
        if (isEnter || isSpace || isPlayPause) {
          const v = videoRef.current; if (!v) return;
          if (v.paused) { v.play().catch(() => {}); setPaused(false); }
          else { v.pause(); setPaused(true); }
        }
        return;
      }

      // ── Сетка ──
      if (isBack) { router.push("/tv-home"); return; }
      if (!channels.length) return;
      setFocus((p) => {
        const n = channels.length;
        if (isLeft) return Math.max(0, p - 1);
        if (isRight) return Math.min(n - 1, p + 1);
        if (isUp) return Math.max(0, p - COLS);
        if (isDown) return Math.min(n - 1, p + COLS);
        if (isEnter) { play(p); return p; }
        return p;
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authed, mode, channels, play, router]);

  // Двигаем реальный фокус/скролл под focus-стейт (в режиме сетки).
  useEffect(() => {
    if (mode !== "grid") return;
    const el = cellRefs.current[focus];
    if (el) { el.focus({ preventScroll: true }); el.scrollIntoView({ behavior: "smooth", block: "center" }); }
  }, [focus, mode, channels.length]);

  // ── Экраны состояний ──
  if (!authed || subLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-black">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-16 w-auto opacity-70" draggable={false} />
      </main>
    );
  }

  if (!isPro) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-5 bg-black text-center px-12">
        <h1 className="text-4xl font-extrabold text-white">Спорт — по подписке Про</h1>
        <p className="text-lg text-white/60 max-w-[560px]">Прямой эфир спортивных каналов доступен подписчикам Про. Оформите Про на сайте sapkeflykino.ru.</p>
        <button
          autoFocus
          onClick={() => router.push("/tv-home")}
          onKeyDown={(e) => { if (e.key === "Enter" || e.keyCode === 13 || e.key === "Backspace" || e.keyCode === 8) router.push("/tv-home"); }}
          className="mt-2 rounded-xl px-8 py-4 text-lg font-bold outline-none ring-4"
          style={{ background: "var(--primary)", color: "var(--primary-foreground)", ["--tw-ring-color" as string]: "var(--primary)" }}
        >
          На главную
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground select-none" style={{ background: "var(--background)" }}>
      {/* ── Полноэкранный плеер ── */}
      {mode === "play" && (
        <div className="fixed inset-0 z-40 bg-black">
          <video ref={videoRef} className="absolute inset-0 h-full w-full bg-black" playsInline autoPlay />
          {/* Плашка канала + статус */}
          <div className="pointer-events-none absolute left-[4vw] top-[4vh] flex items-center gap-3">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
            <span className="text-xl font-semibold text-white/85">{channels[playIdx]?.title || channels[playIdx]?.name}</span>
          </div>
          {paused && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="rounded-full bg-black/60 px-6 py-3 text-lg font-semibold text-white/90">Пауза · OK — продолжить</div>
            </div>
          )}
          <p className="pointer-events-none absolute bottom-[4vh] right-[4vw] text-sm text-white/45">OK — пауза · ↩ назад к каналам</p>
        </div>
      )}

      {/* ── Сетка каналов ── */}
      <header className="px-10 pt-6 pb-4 flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="SAPKEFLY KINO" draggable={false} className="h-10 w-auto"
          style={{ filter: "drop-shadow(0 0 18px rgba(163,230,53,0.45))" }} />
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" /> Спорт — прямой эфир
          </h1>
          <p className="text-sm text-muted-foreground">Живые спортивные каналы · ◀▶▲▼ выбор · OK — включить · ↩ назад</p>
        </div>
      </header>

      {loading ? (
        <div className="flex justify-center py-24">
          <div className="w-12 h-12 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
      ) : channels.length === 0 ? (
        <p className="text-center text-muted-foreground py-24">Каналы временно недоступны. Попробуйте позже.</p>
      ) : (
        <div className="grid gap-3 px-10 pb-12" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }}>
          {channels.map((c, i) => {
            const f = mode === "grid" && focus === i;
            return (
              <button
                key={c.id}
                ref={(node) => { cellRefs.current[i] = node; }}
                tabIndex={f ? 0 : -1}
                onClick={() => { setFocus(i); play(i); }}
                onFocus={() => setFocus(i)}
                className="group flex flex-col items-center gap-2 rounded-xl p-3 outline-none transition-transform duration-100"
                style={{
                  transform: f ? "scale(1.06)" : "scale(1)",
                  background: f ? "color-mix(in srgb, var(--primary) 14%, var(--card))" : "var(--card)",
                  boxShadow: f ? "0 0 0 4px var(--primary), 0 12px 32px rgba(0,0,0,0.55)" : "0 2px 10px rgba(0,0,0,0.4)",
                }}
              >
                <div className="w-full aspect-video rounded-lg bg-black/30 flex items-center justify-center overflow-hidden">
                  {c.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.logo} alt={c.title} className="max-w-[82%] max-h-[82%] object-contain" draggable={false}
                      onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.style.display = "none"; (t.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }} />
                  ) : null}
                  <span className={"text-sm text-center text-muted-foreground px-1 " + (c.logo ? "hidden" : "")}>{c.title || c.name}</span>
                </div>
                <span className="text-[13px] text-center text-foreground/85 line-clamp-1 w-full">{c.title || c.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </main>
  );
}
