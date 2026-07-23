"use client";

// Пре-ролл реклама для FREE-тарифа. Играет ПОСЛЕДОВАТЕЛЬНОСТЬ роликов ПЕРЕД
// бесплатным плеером (Alloha). Часть роликов непропускаемые (короткие бамперы),
// часть — пропускаемые через SKIP_AFTER сек. Контент-плеер в DOM не появляется,
// пока не вызван onDone (гейт в movie/tv-player), поэтому обойти рекламу нельзя.
import { useEffect, useRef, useState } from "react";
import { SkipForward, Volume2, VolumeX } from "lucide-react";

const SKIP_AFTER = 5; // секунд до кнопки «Пропустить» (для пропускаемых роликов)
const AD_VOLUME = 0.35; // умеренная громкость — реклама не «орёт»

export interface AdClip {
  src: string;
  /** true → можно пропустить через SKIP_AFTER сек; false → досмотреть до конца. */
  skippable: boolean;
}

export function PreRollAd({ ads, onDone, tvMode = false }: { ads: AdClip[]; onDone: () => void; tvMode?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [idx, setIdx] = useState(0);
  const [left, setLeft] = useState(SKIP_AFTER);
  const [muted, setMuted] = useState(false);
  const doneRef = useRef(false);
  const cur = ads[idx];

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onDone();
  };
  // Следующий ролик, либо конец всей рекламы.
  const next = () => {
    if (idx < ads.length - 1) setIdx((i) => i + 1);
    else finish();
  };

  const toggleMute = () => {
    const v = videoRef.current;
    const nx = !muted;
    setMuted(nx);
    if (v) v.muted = nx;
  };

  // Можно ли сейчас пропустить (пропускаемый ролик + отсчёт вышел).
  const canSkip = !!cur?.skippable && left <= 0;
  // Рефы для стабильного window-listener на ТВ (без переподписки каждые 250мс).
  const nextRef = useRef(next); nextRef.current = next;
  const muteRef = useRef(toggleMute); muteRef.current = toggleMute;
  const canSkipRef = useRef(canSkip); canSkipRef.current = canSkip;

  // ТВ/пульт: браузерная spatial-навигация в Android TV WebView ненадёжна, поэтому
  // на tvMode вешаем СВОЙ обработчик в ФАЗЕ ПЕРЕХВАТА и ГЛОТАЕМ стрелки/OK, чтобы
  // они не долетели до плеера снизу. OK/→ пропускают (когда уже можно), звук — на ↓.
  useEffect(() => {
    if (!tvMode) return;
    const h = (e: KeyboardEvent) => {
      const c = e.keyCode, k = e.key;
      const isEnter = k === "Enter" || c === 13;
      const isRight = k === "ArrowRight" || c === 39;
      const isArrowOrOk = isEnter || isRight || k === "ArrowLeft" || c === 37 || k === "ArrowUp" || c === 38 || k === "ArrowDown" || c === 40;
      if (!isArrowOrOk) return;
      // Пока идёт реклама — гасим навигацию плеера полностью.
      e.preventDefault();
      e.stopPropagation();
      if ((isEnter || isRight) && canSkipRef.current) nextRef.current();
      else if (k === "ArrowDown" || c === 40) muteRef.current();
    };
    window.addEventListener("keydown", h, true); // capture — раньше обработчика плеера
    return () => window.removeEventListener("keydown", h, true);
  }, [tvMode]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    // Со звуком (умеренно); если браузер блокнёт автоплей со звуком — muted-фолбэк.
    v.volume = AD_VOLUME;
    v.muted = false;
    setMuted(false);
    const p = v.play();
    if (p && typeof p.catch === "function") {
      p.catch(() => { try { v.muted = true; setMuted(true); v.play().catch(() => {}); } catch {} });
    }
    // FAILSAFE: AdBlock/AdGuard-DNS может зарезать запрос ролика → onEnded не
    // наступит НИКОГДА (для непропускаемого = вечный чёрный экран «реклама не
    // заканчивается»). Поэтому: ошибка загрузки ИЛИ нет прогресса воспроизведения
    // за 5с → авто-пропуск ролика. Реклама не важнее просмотра.
    const onError = () => nextRef.current();
    v.addEventListener("error", onError);
    const wd0 = performance.now();
    const watchdog = setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      if (el.currentTime > 0.2) { clearInterval(watchdog); return; } // играет — всё ок
      if (performance.now() - wd0 > 5000) { clearInterval(watchdog); nextRef.current(); }
    }, 500);
    // Отсчёт «Пропустить» только для пропускаемого ролика (по performance.now).
    let iv: ReturnType<typeof setInterval> | null = null;
    if (cur?.skippable) {
      setLeft(SKIP_AFTER);
      const t0 = performance.now();
      iv = setInterval(() => {
        const rem = Math.max(0, Math.ceil(SKIP_AFTER - (performance.now() - t0) / 1000));
        setLeft(rem);
        if (rem <= 0 && iv) clearInterval(iv);
      }, 250);
    }
    return () => {
      v.removeEventListener("error", onError);
      clearInterval(watchdog);
      if (iv) clearInterval(iv);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

  if (!cur) return null;

  return (
    <div className="absolute inset-0 z-40 bg-black flex items-center justify-center">
      <video
        key={idx}
        ref={videoRef}
        src={cur.src}
        className="w-full h-full object-contain"
        playsInline
        autoPlay
        onEnded={next}
      />

      {/* Метка «Реклама» + счётчик роликов, если их больше одного */}
      <div className="absolute top-3 left-3 px-2.5 py-1 rounded-md bg-black/70 text-white/90 text-[11px] font-bold uppercase tracking-wider ring-1 ring-white/15">
        Реклама{ads.length > 1 ? ` ${idx + 1}/${ads.length}` : ""}
      </div>

      {/* Звук вкл/выкл — всегда доступно */}
      <button
        onClick={toggleMute}
        aria-label={muted ? "Включить звук" : "Выключить звук"}
        className="absolute top-3 right-3 inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-black/70 text-white/90 text-[12px] font-semibold ring-1 ring-white/15 hover:bg-black/85 transition-colors"
      >
        {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        {muted ? "Звук" : "Без звука"}
      </button>

      {/* Пропуск — только для пропускаемого ролика и только после SKIP_AFTER сек.
          На ТВ (tvMode) — крупнее, с фокус-рамкой и подсказкой пульта. */}
      <div className={tvMode ? "absolute bottom-[6vh] right-[5vw] flex flex-col items-end gap-2" : "absolute bottom-4 right-4"}>
        {cur.skippable ? (
          left > 0 ? (
            <div className={
              tvMode
                ? "inline-flex items-center h-14 px-6 rounded-xl bg-black/70 text-white/80 text-lg font-semibold ring-1 ring-white/15 select-none"
                : "inline-flex items-center h-10 px-4 rounded-lg bg-black/70 text-white/75 text-[13px] font-medium ring-1 ring-white/12 select-none"
            }>
              {"Пропустить через " + left}
            </div>
          ) : (
            <button
              onClick={next}
              autoFocus={tvMode}
              className={
                tvMode
                  ? "inline-flex items-center gap-2 h-14 px-7 rounded-xl bg-white text-black text-lg font-bold shadow-lg outline-none ring-4 ring-[var(--primary)] active:scale-[0.98] transition-all"
                  : "inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-white text-black text-[13px] font-bold hover:bg-white/90 active:scale-[0.98] transition-all shadow-lg"
              }
            >
              {"Пропустить рекламу"} <SkipForward size={tvMode ? 20 : 15} fill="currentColor" />
            </button>
          )
        ) : (
          <div className={
            tvMode
              ? "inline-flex items-center h-12 px-5 rounded-xl bg-black/60 text-white/65 text-base font-medium ring-1 ring-white/10 select-none"
              : "inline-flex items-center h-9 px-3 rounded-lg bg-black/60 text-white/60 text-[12px] font-medium ring-1 ring-white/10 select-none"
          }>
            {"Реклама без пропуска"}
          </div>
        )}
        {tvMode && (
          <p className="text-sm text-white/50 select-none">OK — пропустить · ↓ звук</p>
        )}
      </div>
    </div>
  );
}
