"use client";

// Переключатель плеера на странице просмотра — только для Про. Три источника без
// раскрытия движков: Плеер 1 = HDRezka (наш плеер), Плеер 2 = Alloha (4K, VK),
// Плеер 3 = kino.pub (может слететь — на месячном бесплатном доступе). Выбор
// глобальный (setSource) + перезагрузка, чтобы плеер пересобрался на новом
// источнике. Free-юзерам не показывается (у них только бесплатный zenithjs).

import { useEffect, useState } from "react";
import { getSource, setSource, HDREZKA_UP, type KinoSource } from "@/lib/kinopub";
import { useSubscription } from "@/hooks/use-subscription";

// HDRezka лежит → прячем Плеер 1 (hdrezka) и перенумеровываем: Alloha=Плеер 1,
// kino.pub=Плеер 2. Вернётся HDRezka (HDREZKA_UP=true) — снова 1/2/3.
const PLAYERS: { src: KinoSource; label: string }[] = HDREZKA_UP
  ? [
      { src: "hdrezka", label: "Плеер 1" },
      { src: "alloha", label: "Плеер 2" },
      { src: "kinopub", label: "Плеер 3" },
      { src: "vkmovie", label: "Плеер 4" },
    ]
  : [
      { src: "alloha", label: "Плеер 1" },
      { src: "kinopub", label: "Плеер 2" },
      { src: "vkmovie", label: "Плеер 3" },
    ];

export function PlayerSwitcher({ mediaType = "movie" }: { mediaType?: "movie" | "tv" }) {
  const { isPro, loading } = useSubscription();
  const [cur, setCur] = useState<KinoSource | null>(null);
  // VkMovie = только фильмы → на страницах сериалов прячем этот плеер.
  const players = mediaType === "tv" ? PLAYERS.filter((p) => p.src !== "vkmovie") : PLAYERS;
  useEffect(() => {
    const read = () => setCur(getSource());
    read();
    window.addEventListener("kino-source-changed", read);
    return () => window.removeEventListener("kino-source-changed", read);
  }, []);

  if (loading || !isPro) return null;

  const switchTo = (s: KinoSource) => {
    if (s === getSource()) return;
    setSource(s);
    window.location.reload();
  };

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70 mr-0.5">Плеер</span>
      {/* На мобиле 3 равные пилюли в один ряд (flex-1), на десктопе — по контенту. */}
      <div className="flex w-full sm:w-auto gap-2">
        {players.map((p) => {
          const active = cur === p.src;
          return (
            <button
              key={p.src}
              onClick={() => switchTo(p.src)}
              className={
                "flex-1 sm:flex-none inline-flex items-center justify-center sm:justify-start gap-2 h-9 px-3 sm:px-4 rounded-full text-[13px] font-semibold border transition-all " +
                (active
                  ? "border-primary/45 bg-primary/12 text-primary shadow-sm shadow-primary/10"
                  : "border-white/[0.08] bg-white/[0.03] text-muted-foreground hover:border-white/20 hover:text-foreground hover:bg-white/[0.06]")
              }
            >
              <span className={"w-1.5 h-1.5 rounded-full shrink-0 " + (active ? "bg-primary" : "bg-muted-foreground/40")} />
              {p.label}
            </button>
          );
        })}
      </div>
      <span className="w-full sm:w-auto text-[11.5px] text-muted-foreground/60 sm:ml-1">не идёт — попробуйте другой</span>
    </div>
  );
}
