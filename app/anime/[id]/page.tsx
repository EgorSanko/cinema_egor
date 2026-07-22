"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Navbar } from "@/components/navbar";
import { AnimeSkip } from "@/components/anime-skip";
import {
  aniRelease, aniFranchise, aniPoster, aniTitle, aniQualities, aniVoices,
  type AniReleaseFull, type AniEpisode, type AniFranchise,
} from "@/lib/anilibria";
import {
  getAnimePosition, saveAnimePosition, addAnimeHistory, getLastAnimeEpisode,
} from "@/lib/anime-storage";

const ArtPlayerView = dynamic(() => import("@/components/art-player").then((m) => m.ArtPlayerView), { ssr: false });

const Q_ORDER = ["1080p", "720p", "480p"];

function fmt(s: number) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${x.toString().padStart(2, "0")}` : `${m}:${x.toString().padStart(2, "0")}`;
}

export default function AnimeReleasePage() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const rid = Number(id);

  const [rel, setRel] = useState<AniReleaseFull | null>(null);
  const [franchise, setFranchise] = useState<AniFranchise | null>(null);
  const [loading, setLoading] = useState(true);
  const [epIndex, setEpIndex] = useState(0);
  const [quality, setQuality] = useState<string>("720p");
  const [started, setStarted] = useState(false);
  const [resumeAt, setResumeAt] = useState(0);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  const [playerEl, setPlayerEl] = useState<HTMLElement | null>(null);

  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const metaRef = useRef({ id: 0, ordinal: 0, episodeId: "", title: "", poster: "" });

  // Загрузка релиза + франшизы (сезоны)
  useEffect(() => {
    if (!id) return;
    (async () => {
      setLoading(true);
      const r = await aniRelease(id);
      setRel(r);
      setLoading(false);
    })();
    aniFranchise(id).then(setFranchise).catch(() => {});
  }, [id]);

  const episodes: AniEpisode[] = useMemo(() => {
    const eps = rel?.episodes || [];
    return [...eps].sort((a, b) => (a.ordinal || 0) - (b.ordinal || 0));
  }, [rel]);

  // Авто-выбор последней смотренной серии
  useEffect(() => {
    if (!rel || episodes.length === 0) return;
    const last = getLastAnimeEpisode(rid);
    if (last) {
      const idx = episodes.findIndex((e) => e.ordinal === last.ordinal);
      if (idx >= 0) setEpIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel]);

  const curEp = episodes[epIndex];
  const quals = useMemo(() => aniQualities(curEp), [curEp]);
  const effQuality = quals[quality] ? quality : (Q_ORDER.find((q) => quals[q]) || Object.keys(quals)[0] || "");
  const streamUrl = quals[effQuality] || "";

  const title = aniTitle(rel?.name);
  const poster = aniPoster(rel?.poster);
  const voices = aniVoices(rel?.members);

  // Позиция «продолжить» для текущей серии
  useEffect(() => {
    if (!rel || !curEp) { setResumeAt(0); return; }
    const p = getAnimePosition(rid, curEp.ordinal);
    setResumeAt(p && p.time > 10 ? p.time : 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rel, epIndex]);

  // Держим метаданные текущей серии в ref для интервала сохранения
  useEffect(() => {
    metaRef.current = { id: rid, ordinal: curEp?.ordinal || 0, episodeId: curEp?.id || "", title, poster };
  }, [rid, curEp, title, poster]);

  // Интервал сохранения позиции + истории (как у movie/tv-плеера)
  const startSaving = (v: HTMLVideoElement) => {
    if (saveIntervalRef.current) clearInterval(saveIntervalRef.current);
    saveIntervalRef.current = setInterval(() => {
      if (!v || v.paused) return;
      const ct = v.currentTime, dur = v.duration;
      if (ct > 5 && dur > 10) {
        const m = metaRef.current;
        saveAnimePosition(m.id, m.ordinal, ct, dur);
        addAnimeHistory({ id: m.id, title: m.title, poster: m.poster, ordinal: m.ordinal, episodeId: m.episodeId, progress: ct, duration: dur });
      }
    }, 5000);
  };
  useEffect(() => () => { if (saveIntervalRef.current) clearInterval(saveIntervalRef.current); }, []);

  const playEpisode = (idx: number) => { setEpIndex(idx); setStarted(true); };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-[1200px] mx-auto px-4 pt-10"><div className="aspect-video rounded-2xl bg-white/[0.04] animate-pulse" /></div>
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

  const relatedSeasons = (franchise?.franchise_releases || [])
    .slice()
    .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

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
            <div className="relative">
              <ArtPlayerView
                streamUrl={streamUrl}
                poster={poster}
                qualities={quals}
                selectedQuality={effQuality}
                onQualityChange={(q) => setQuality(q)}
                episodeNav={{ hasPrev: epIndex > 0, hasNext: epIndex < episodes.length - 1 }}
                onPrevEpisode={() => setEpIndex((i) => Math.max(0, i - 1))}
                onNextEpisode={() => setEpIndex((i) => Math.min(episodes.length - 1, i + 1))}
                resumeTime={resumeAt > 10 ? resumeAt : undefined}
                autoStart
                onVideoReady={(v) => { setVideoEl(v); startSaving(v); }}
                onPlayerContainerReady={(el) => setPlayerEl(el)}
              />
              <AnimeSkip
                video={videoEl}
                container={playerEl}
                opening={curEp?.opening}
                ending={curEp?.ending}
                hasNext={epIndex < episodes.length - 1}
                onNext={() => setEpIndex((i) => Math.min(episodes.length - 1, i + 1))}
              />
            </div>
          ) : (
            <div className="relative aspect-video rounded-2xl overflow-hidden ring-1 ring-white/[0.07] bg-black grid place-items-center">
              {poster && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={poster} alt={title} className="absolute inset-0 w-full h-full object-cover opacity-45" />
              )}
              <div className="relative z-10 flex flex-col items-center gap-3">
                <button
                  onClick={() => setStarted(true)}
                  disabled={!streamUrl}
                  className="inline-flex items-center gap-3 px-7 h-14 rounded-full font-bold text-black bg-gradient-to-r from-lime-400 to-fuchsia-400 hover:opacity-90 disabled:opacity-40 transition shadow-lg shadow-fuchsia-500/25"
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                  {!streamUrl ? "Нет потока" : resumeAt > 10 ? `Продолжить с ${fmt(resumeAt)}` : `Смотреть ${curEp?.ordinal || 1} серию`}
                </button>
                {resumeAt > 10 && (
                  <div className="text-[12px] text-white/60">серия {curEp?.ordinal} · остановились на {fmt(resumeAt)}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Инфо */}
        <div className="mt-5">
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
          {rel.description && <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground max-w-3xl">{rel.description}</p>}
        </div>

        {/* Сезоны / связанное (франшиза) */}
        {relatedSeasons.length > 1 && (
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-lime-400 to-fuchsia-500" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                {franchise?.name ? `Франшиза «${franchise.name}»` : "Сезоны и связанное"}
              </h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {relatedSeasons.map((fr) => {
                const r = fr.release;
                const active = r.id === rid;
                return (
                  <Link key={r.id} href={`/anime/${r.id}`} className="group shrink-0 w-[130px]">
                    <div className={"relative aspect-[2/3] rounded-lg overflow-hidden ring-1 transition-all " + (active ? "ring-lime-400/70" : "ring-white/[0.07] group-hover:ring-fuchsia-400/50")}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={aniPoster(r.poster)} alt={aniTitle(r.name)} loading="lazy" className="w-full h-full object-cover" />
                      {active && <div className="absolute inset-0 ring-2 ring-inset ring-lime-400/70 rounded-lg" />}
                    </div>
                    <div className="mt-1 text-[11.5px] font-medium text-foreground/85 line-clamp-2 leading-tight">{aniTitle(r.name)}</div>
                    <div className="text-[10px] text-muted-foreground">{r.year} · {r.type?.description || r.type?.value}</div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

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
                const watched = getAnimePosition(rid, ep.ordinal);
                return (
                  <button
                    key={ep.id}
                    onClick={() => playEpisode(i)}
                    title={ep.name || `${ep.ordinal} серия`}
                    className={
                      "relative h-10 rounded-lg text-[13px] font-semibold border transition-all overflow-hidden " +
                      (active
                        ? "border-lime-400/60 bg-gradient-to-br from-lime-400/20 to-fuchsia-500/20 text-foreground"
                        : "border-white/[0.07] bg-white/[0.03] text-muted-foreground hover:border-fuchsia-400/40 hover:text-foreground hover:bg-white/[0.05]")
                    }
                  >
                    {ep.ordinal}
                    {watched && watched.time > 10 && (
                      <span className="absolute bottom-0 left-0 h-[3px] bg-lime-400/80" style={{ width: `${Math.min(100, Math.round((watched.time / watched.duration) * 100))}%` }} />
                    )}
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
