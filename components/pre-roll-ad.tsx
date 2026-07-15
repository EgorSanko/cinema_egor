"use client";

// Пре-ролл реклама для FREE-тарифа. Играет ПЕРЕД бесплатным плеером (Alloha).
// Пропустить можно только через SKIP_AFTER секунд — кнопка до этого не
// показывается. Контент-iframe в DOM не появляется, пока не вызван onDone
// (см. movie-player/tv-player: iframe рендерится только при isPro || adDone),
// поэтому обойти рекламу «мимо» нельзя — досмотреть 5с придётся.
import { useEffect, useRef, useState } from "react";
import { SkipForward, Volume2, VolumeX } from "lucide-react";

const SKIP_AFTER = 5; // секунд до появления кнопки «Пропустить»
const AD_VOLUME = 0.35; // умеренная громкость — реклама не «орёт»
const MUTE_KEY = "kino_ad_muted"; // запоминаем выбор юзера

export function PreRollAd({ src, onDone }: { src: string; onDone: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [left, setLeft] = useState(SKIP_AFTER);
  const [muted, setMuted] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (v) v.muted = next;
    try { localStorage.setItem(MUTE_KEY, next ? "1" : "0"); } catch {}
  };

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Изначально СО ЗВУКОМ (умеренная громкость). Если браузер блокнёт автоплей
    // со звуком (мобилки/строгие) — глушим и играем без звука, чтобы не было
    // чёрного экрана/паузы; звук юзер включит кнопкой. (Чёрный экран из прошлой
    // жалобы был из-за адблока на /ads/ — путь уже перенесён на /media/.)
    v.volume = AD_VOLUME;
    v.muted = false;
    setMuted(false);
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { try { v.muted = true; setMuted(true); v.play().catch(() => {}); } catch {} });
    }
    // Отсчёт по реальному времени (performance.now), чтобы сворачивание вкладки
    // или троттлинг таймера не «замораживали» пропуск, но и не давали ускорить.
    const t0 = performance.now();
    const iv = setInterval(() => {
      const rem = Math.max(0, Math.ceil(SKIP_AFTER - (performance.now() - t0) / 1000));
      setLeft(rem);
      if (rem <= 0) clearInterval(iv);
    }, 250);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="absolute inset-0 z-40 bg-black flex items-center justify-center">
      <video
        ref={videoRef}
        src={src}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        onEnded={finish}
      />

      {/* Метка «Реклама» */}
      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 text-white/90 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/15">
        Реклама
      </div>

      {/* Звук вкл/выкл — всегда доступно (реклама не орёт, можно приглушить) */}
      <button
        onClick={toggleMute}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-black/70 text-white/90 text-[12px] font-semibold ring-1 ring-white/15 hover:bg-black/85 transition-colors"
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {muted ? "Звук" : "Без звука"}
      </button>

      {/* Пропустить — только после SKIP_AFTER секунд */}
      <div className="absolute bottom-4 right-4">
        {left > 0 ? (
          <div className="inline-flex items-center h-10 px-4 rounded-lg bg-black/70 text-white/75 text-[13px] font-medium ring-1 ring-white/12 select-none">
            {"Пропустить через " + left}
          </div>
        ) : (
          <button
            onClick={finish}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-white text-black text-[13px] font-bold hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
          >
            {"Пропустить рекламу"} <SkipForward size={15} fill="currentColor" />
          </button>
        )}
      </div>
    </div>
  );
}
