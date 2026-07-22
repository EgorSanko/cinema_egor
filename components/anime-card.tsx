"use client";

import Link from "next/link";
import { AniRelease, aniPoster, aniTitle } from "@/lib/anilibria";

// Карточка аниме для вкладки /anime. Стиль под jut-su (постер-форвард, тёмная,
// бейджи), но в бренде sapkeflykino: салатовый (#a3e635) + розово-фиолетовый
// (fuchsia/purple) свечение на ховере.
export function AnimeCard({ r }: { r: AniRelease }) {
  const title = aniTitle(r.name);
  const poster = aniPoster(r.poster, "thumb");
  return (
    <Link href={`/anime/${r.id}`} className="group block">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-white/[0.04] ring-1 ring-white/[0.07] transition-all duration-300 group-hover:ring-fuchsia-400/60 group-hover:shadow-[0_0_28px_-6px_rgba(232,121,249,0.55)]">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={title} loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.06]" />
        ) : (
          <div className="w-full h-full grid place-items-center text-muted-foreground/40 text-xs">нет постера</div>
        )}

        {/* верхние бейджи */}
        <div className="absolute top-2 left-2 flex flex-col items-start gap-1">
          {r.is_ongoing && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-lime-400 text-black shadow-sm">ОНГОИНГ</span>
          )}
          {r.type?.value === "MOVIE" && (
            <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-fuchsia-500 text-white shadow-sm">ФИЛЬМ</span>
          )}
        </div>

        {/* низ: название + мета */}
        <div className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/95 via-black/55 to-transparent">
          <div className="text-[12px] font-semibold text-white line-clamp-2 leading-tight">{title}</div>
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-white/60">
            {r.year ? <span>{r.year}</span> : null}
            {r.type?.description && (<><span className="w-1 h-1 rounded-full bg-white/30" /><span>{r.type.description}</span></>)}
            {r.episodes_total ? (<><span className="w-1 h-1 rounded-full bg-white/30" /><span>{r.episodes_total} эп.</span></>) : null}
          </div>
        </div>
      </div>
    </Link>
  );
}
