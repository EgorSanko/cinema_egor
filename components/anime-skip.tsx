"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { SkipForward } from "lucide-react";
import type { AniSkip } from "@/lib/anilibria";

// Кнопка «Пропустить опенинг/эндинг» для аниме-плеера. Метки берём прямо из
// Anilibria (episode.opening/ending {start,stop}) — без бэкенда. Портируется в
// контейнер ArtPlayer, чтобы жить и в фуллскрине.
interface Props {
  video: HTMLVideoElement | null;
  container?: HTMLElement | null;
  opening?: AniSkip | null;
  ending?: AniSkip | null;
  hasNext?: boolean;
  onNext?: () => void;
}

export function AnimeSkip({ video, container, opening, ending, hasNext, onNext }: Props) {
  const [mode, setMode] = useState<null | "intro" | "outro">(null);

  useEffect(() => {
    if (!video) return;
    const onTime = () => {
      const t = video.currentTime;
      const inIntro = !!opening && opening.start != null && opening.stop != null && t >= opening.start && t < (opening.stop as number) - 0.5;
      const inOutro = !!ending && ending.start != null && t >= (ending.start as number) && (ending.stop == null || t < (ending.stop as number));
      setMode(inIntro ? "intro" : inOutro ? "outro" : null);
    };
    video.addEventListener("timeupdate", onTime);
    return () => video.removeEventListener("timeupdate", onTime);
  }, [video, opening, ending]);

  if (!mode) return null;

  const doSkip = () => {
    if (!video) return;
    if (mode === "intro" && opening?.stop != null) {
      video.currentTime = (opening.stop as number) + 0.2;
    } else if (mode === "outro") {
      if (hasNext && onNext) onNext();
      else if (ending?.stop != null) video.currentTime = (ending.stop as number) + 0.2;
    }
  };

  const label = mode === "intro" ? "Пропустить опенинг" : hasNext ? "Следующая серия →" : "Пропустить эндинг";

  const btn = (
    <button
      onClick={doSkip}
      className="absolute bottom-16 right-4 z-[60] inline-flex items-center gap-2 px-4 h-10 rounded-full text-[13px] font-semibold text-black bg-gradient-to-r from-lime-400 to-fuchsia-400 shadow-lg shadow-fuchsia-500/30 hover:opacity-95 active:scale-95 transition"
    >
      <SkipForward size={16} /> {label}
    </button>
  );

  return container ? createPortal(btn, container) : btn;
}
