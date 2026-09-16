"use client";

/**
 * НАШ плеер на домене плеера (player.sapkeflykino.ru/p/).
 *
 * Зачем отдельная страница. VK отдаёт куски видео только тому, чей Origin
 * совпадает с доменом, под которым выпущена ссылка (любой другой → 403
 * origin_mismatch), и отдельно режет серверные адреса: наш сервер узел
 * закрывает за 2–3 минуты, а браузер зрителя качает часами — замер 15.09
 * показал 92 куска из 92 без единого отказа.
 *
 * Отсюда схема: страница лежит на домене выпуска, ссылки берутся СЫРЫЕ (без
 * нашего прокси), и видео тянет сам зритель. Внутри — наш обычный ArtPlayer,
 * то есть озвучки, качество, перемотка и никакой чужой рекламы.
 *
 * Наружу шлём то же, что умеет их окно (play/pause/timeupdate с временем),
 * чтобы страница сайта сохраняла прогресс и «продолжить просмотр» работало.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtPlayerView } from "@/components/art-player";

type Дорожка = { name: string; quality: Record<string, string> };
type Ответ = { translations?: Дорожка[]; skipTime?: unknown; error?: string };

const ПОРЯДОК = ["2160", "1440", "1080", "720", "480", "360"];

function выбрать(д: Дорожка | undefined, кач: string): { url: string; quality: string } | null {
  const q = д?.quality || {};
  if (q[кач]) return { url: q[кач], quality: кач };
  for (const k of ПОРЯДОК) if (q[k]) return { url: q[k], quality: k };
  const ключи = Object.keys(q);
  return ключи.length ? { url: q[ключи[0]], quality: ключи[0] } : null;
}

export default function ОкноПлеера() {
  const [дорожки, setДорожки] = useState<Дорожка[]>([]);
  const [дорожка, setДорожка] = useState(0);
  const [качество, setКачество] = useState("1080");
  const [поток, setПоток] = useState<string | null>(null);
  const [ошибка, setОшибка] = useState<string | null>(null);
  const видео = useRef<HTMLVideoElement | null>(null);
  const прыжок = useRef<number | undefined>(undefined);

  const парам = useCallback(() => {
    if (typeof window === "undefined") return new URLSearchParams();
    return new URLSearchParams(window.location.search);
  }, []);

  // ── Резолв: сырые ссылки VK, наш сервер в раздаче не участвует ────────
  useEffect(() => {
    const п = парам();
    const tmdb = п.get("tmdb") || "";
    const тип = п.get("type") === "tv" ? "tv" : "movie";
    if (!tmdb) { setОшибка("не передан фильм"); return; }

    const адрес = new URLSearchParams({ tmdb, type: тип });
    if (тип === "tv") {
      адрес.set("season", п.get("season") || "1");
      адрес.set("episode", п.get("episode") || "1");
    }
    let живо = true;
    fetch(`/api/alloha-direct?${адрес}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((д: Ответ) => {
        if (!живо) return;
        const т = д.translations || [];
        if (!т.length) { setОшибка(д.error === "not_found" ? "нет в плеере" : "не удалось получить видео"); return; }
        setДорожки(т);
        const выбор = выбрать(т[0], качество);
        if (!выбор) { setОшибка("нет подходящего качества"); return; }
        setКачество(выбор.quality);
        setПоток(выбор.url);
      })
      .catch(() => { if (живо) setОшибка("нет связи"); });
    return () => { живо = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Наружу: события как у их окна, чтобы сайт писал прогресс ──────────
  useEffect(() => {
    const в = видео.current;
    if (!в) return;
    const шли = (событие: string) => {
      try {
        window.parent.postMessage(
          JSON.stringify({ event: событие, time: в.currentTime }), "*",
        );
      } catch {}
    };
    const наИгру = () => шли("play");
    const наПаузу = () => шли("pause");
    const наВремя = () => шли("timeupdate");
    в.addEventListener("play", наИгру);
    в.addEventListener("pause", наПаузу);
    в.addEventListener("timeupdate", наВремя);
    return () => {
      в.removeEventListener("play", наИгру);
      в.removeEventListener("pause", наПаузу);
      в.removeEventListener("timeupdate", наВремя);
    };
  }, [поток]);

  // ── Снаружи: те же команды, что понимает их окно ──────────────────────
  useEffect(() => {
    const принять = (e: MessageEvent) => {
      let д: any;
      try { д = JSON.parse(String(e.data)); } catch { return; }
      const в = видео.current;
      if (!в || !д?.api) return;
      if (д.api === "play") в.play().catch(() => {});
      else if (д.api === "pause") в.pause();
      else if (д.api === "seek" && typeof д.value === "number") в.currentTime = д.value;
      else if (д.api === "duration") {
        try {
          window.parent.postMessage(JSON.stringify({ event: "duration", time: в.duration }), "*");
        } catch {}
      }
    };
    window.addEventListener("message", принять);
    return () => window.removeEventListener("message", принять);
  }, []);

  const сменитьКачество = (к: string) => {
    const в = видео.current;
    прыжок.current = в && в.currentTime > 1 ? в.currentTime : undefined;
    const выбор = выбрать(дорожки[дорожка], к);
    if (выбор) { setКачество(выбор.quality); setПоток(выбор.url); }
  };

  const сменитьДорожку = (и: number) => {
    const в = видео.current;
    прыжок.current = в && в.currentTime > 1 ? в.currentTime : undefined;
    const выбор = выбрать(дорожки[и], качество);
    if (выбор) { setДорожка(и); setКачество(выбор.quality); setПоток(выбор.url); }
  };

  const старт = Number(парам().get("start") || 0);

  if (ошибка) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
                    background: "#000", color: "#fff", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
        <div>
          <div style={{ fontSize: 20, marginBottom: 6 }}>Видео не открылось</div>
          <div style={{ color: "rgba(255,255,255,.6)" }}>{ошибка}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ height: "100vh", background: "#000" }}>
      {поток && (
        <ArtPlayerView
          streamUrl={поток}
          qualities={дорожки[дорожка]?.quality}
          selectedQuality={качество}
          onQualityChange={сменитьКачество}
          translators={дорожки.map((д, и) => ({ id: и, name: д.name }))}
          selectedTranslator={дорожка}
          onTranslatorChange={сменитьДорожку}
          resumeTime={старт > 5 ? старт : undefined}
          seekOnSwitch={прыжок.current}
          autoStart
          interactive
          onVideoReady={(в) => { видео.current = в; }}
          onVideoUnmount={() => { видео.current = null; }}
        />
      )}
    </div>
  );
}
