"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/navbar";
import {
  aniRelease, aniPoster, aniTitle, aniQualities, aniVoices,
  type AniReleaseFull, type AniEpisode,
} from "@/lib/anilibria";

// ArtPlayer тянет artplayer+hls.js и лезет в document → только на клиенте.
const ArtPlayerView = dynamic(() => import("@/components/art-player").then((m) => m.ArtPlayerView), { ssr: false });

const Q_ORDER = ["1080p", "720p", "480p"];

export default function AnimeReleasePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;

  const [rel, setRel] = useState<AniReleaseFull | null>(null);
  const [loading, setLoading] = useState(true);
  const [epIndex, setEpIndex] = useState(0);
  const [quality, setQuality] = useState<string>("720p");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const r = await aniRelease(id);
      setRel(r);
      setLoading(false);
    })();
  }, [id]);

  // Эпизоды по порядку
  const episodes: AniEpisode[] = useMemo(() => {
    const eps = rel?.episodes || [];
    return [...eps].sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
  }, [rel]);

  const curEp = episodes[epIndex];
  const quals = useMemo(() => aniQualities(curEp), [curEp]);

  // При смене серии/данных — если выбранного качества нет, берём высшее доступное
  const effQuality = quals[quality] ? quality : (Q_ORDER.find((q) => quals[q]) || Object.keys(quals)[0] || "");
  const streamUrl = quals[effQuality] || "";

  const title = aniTitle(rel?.name);
  const poster = aniPoster(rel?.poster, "full");
  const voices = aniVoices(rel?.members);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-[1200px] mx-auto px-4 pt-10">
          <div className="aspect-video rounded-2xl bg-white/[0.04] animate-pulse" />
        </div>
      </div>
    );
  }

  if (!rel) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-[1200px] mx-auto px-4 pt-20 text-center text-muted-foreground">
          Аниме не найдено. <Link href="/anime" className="text-lime-400 hover:underline">← к каталогу</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-[1200px] mx-auto px-4 sm:px-6 pt-4 pb-16">
        <Link href="/anime" className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-fuchsia-300 transition mb-3">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6" /></svg>
          Аниме
        </Link>

        {/* Плеер / постер-гейт */}
        <div className="relative">
          {started && streamUrl ? (
            <ArtPlayerView
              streamUrl={streamUrl}
              poster={poster}
              qualities={quals}
              selectedQuality={effQuality}
              onQualityChange={(q) => setQuality(q)}
              episodeNav={{ hasPrev: epIndex > 0, hasNext: epIndex < episodes.length - 1 }}
              onPrevEpisode={() => setEpIndex((i) => Math.max(0, i - 1))}
              onNextEpisode={() => setEpIndex((i) => Math.min(episodes.length - 1, i + 1))}
              autoStart
            />
          ) : (
            <div className="relative aspect-video rounded-2xl overflow-hidden ring-1 ring-white/[0.07] bg-black grid place-items-center">
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover opacity-40" />
              )}
              <button
                onClick={() => { setStarted(true); }}
                disabled={!streamUrl}
                className="relative z-10 inline-flex items-center gap-3 px-7 h-14 rounded-full font-bold text-black bg-gradient-to-r from-lime-400 to-fuchsia-400 hover:opacity-90 disabled:opacity-40 transition shadow-lg shadow-fuchsia-500/20"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                {streamUrl ? `Смотреть ${curEp?.ordinal || 1} серию` : "Нет потока"}
              </button>
            </div>
          )}
        </div>

        {/* Инфо */}
        <div className="mt-5 grid md:grid-cols-[1fr_auto] gap-4 items-start">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-black">
              <span className="bg-gradient-to-r from-lime-300 via-fuchsia-400 to-purple-400 bg-clip-text text-transparent">{title}</span>
            </h1>
            {rel.name.english && <div className="text-sm text-muted-foreground/70 mt-0.5">{rel.name.english}</div>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px]">
              {rel.year ? <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-muted-foreground">{rel.year}</span> : null}
              {rel.type?.description && <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-muted-foreground">{rel.type.description}</span>}
              {rel.is_ongoing && <span className="px-2 py-0.5 rounded-md bg-lime-400/15 text-lime-300 font-semibold">Онгоинг</span>}
              {rel.age_rating?.label && <span className="px-2 py-0.5 rounded-md bg-fuchsia-500/15 text-fuchsia-300">{rel.age_rating.label}</span>}
              {(rel.genres || []).slice(0, 4).map((g) => (
                <span key={g.id} className="px-2 py-0.5 rounded-md bg-purple-500/10 text-purple-300/90">{g.name}</span>
              ))}
            </div>
            {voices.length > 0 && (
              <div className="mt-2 text-[12px] text-muted-foreground">
                <span className="text-fuchsia-300/80 font-medium">Озвучка:</span> AniLibria — {voices.slice(0, 4).join(", ")}
              </div>
            )}
            {rel.description && (
              <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground max-w-3xl">{rel.description}</p>
            )}
          </div>
        </div>

        {/* Серии */}
        {episodes.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-lime-400 to-fuchsia-500" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Серии <span className="text-foreground/50">({episodes.length})</span>
              </h2>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
              {episodes.map((ep, i) => {
                const active = i === epIndex && started;
                return (
                  <button
                    key={ep.id}
                    onClick={() => { setEpIndex(i); setStarted(true); }}
                    title={ep.name || `${ep.ordinal} серия`}
                    className={
                      "h-10 rounded-lg text-[13px] font-semibold border transition-all " +
                      (active
                        ? "border-lime-400/60 bg-gradient-to-br from-lime-400/20 to-fuchsia-500/20 text-foreground"
                        : "border-white/[0.07] bg-white/[0.03] text-muted-foreground hover:border-fuchsia-400/40 hover:text-foreground hover:bg-white/[0.05]")
                    }
                  >
                    {ep.ordinal}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
