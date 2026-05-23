"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Sparkles, Dices, X, Play } from "lucide-react";

// TMDB genre IDs used by the mood filter. Each mood maps to one or
// more genres + a min vote_average so we don't pull garbage.
// Mood presets — used by both the picker grid AND the wheel roulette.
// Each maps to TMDB genre ids + a min rating filter. Icon is a single
// emoji rendered big in the buttons; the wheel uses the same set.
const MOODS: { id: string; label: string; subLabel: string; emoji: string; genres: number[]; minRating: number; color: string }[] = [
  { id: "fun",       label: "Хочу веселья",      subLabel: "Комедии, приключения", emoji: "😄", genres: [35, 12],          minRating: 6.5, color: "#a3e635" },
  { id: "sad",       label: "Чувствую грусть",   subLabel: "Драмы, мелодрамы",     emoji: "👻", genres: [18, 10749],       minRating: 7.0, color: "#c4b5fd" },
  { id: "scary",     label: "Хочу страха",       subLabel: "Ужасы, триллеры",      emoji: "🎃", genres: [27, 53],          minRating: 6.5, color: "#7dd3fc" },
  { id: "action",    label: "Нужен экшен",       subLabel: "Боевик, приключения",  emoji: "⚡", genres: [28, 12],          minRating: 6.5, color: "#fde047" },
  { id: "smart",     label: "Хочу поразмыслить", subLabel: "Драмы, детективы",     emoji: "🪐", genres: [18, 9648],        minRating: 7.0, color: "#a3e635" },
  { id: "romantic",  label: "Романтика",         subLabel: "Мелодрамы, любовь",    emoji: "💖", genres: [10749, 35],       minRating: 6.5, color: "#f9a8d4" },
];

interface Movie {
  id: number; title?: string; name?: string;
  poster_path?: string | null; backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
}

const POSTER = "https://sapkeflykino.ru/tmdb-img";

// Image preload helpers — used by the roulette to warm browser cache
// BEFORE animating so posters don't pop in mid-spin
function preloadOne(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return resolve();
    const img = new window.Image();
    img.onload = () => resolve();
    img.onerror = () => reject();
    img.src = url;
  });
}
function preloadPosters(items: Movie[]) {
  for (const m of items) {
    if (m.poster_path) { preloadOne(`${POSTER}/w500${m.poster_path}`).catch(() => {}); }
  }
}

export function MoodAndRoulette() {
  const [openMood, setOpenMood] = useState<string | null>(null);
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinPick, setSpinPick] = useState<Movie | null>(null);
  const [spinPool, setSpinPool] = useState<Movie[]>([]);

  // Pool = TMDB top_rated + popular (random pages), MINUS what the user
  // already watched/has in history. Goal is *discovery* — recommending
  // unseen titles. Old impl picked from history which defeated the point.
  const buildPool = async (): Promise<Movie[]> => {
    if (spinPool.length > 0) return spinPool;
    let pool: Movie[] = [];
    // Skip-set from local storage so we don't show what user already saw
    const skip = new Set<number>();
    try {
      const histRaw = localStorage.getItem("kino_history");
      const favRaw = localStorage.getItem("kino_favorites");
      const hist = histRaw ? JSON.parse(histRaw) : [];
      const favs = favRaw ? JSON.parse(favRaw) : [];
      for (const m of [...hist, ...favs]) if (m?.id) skip.add(m.id);
    } catch {}
    // Pull 2 random pages from top_rated + 1 random page from popular
    // for variety. Filter out adult and items the user has touched.
    const pages = [
      `/tmdb-api/movie/top_rated?api_key=275c9d09780aadb4b13ff57a731eda00&language=ru-RU&page=${1 + Math.floor(Math.random() * 5)}`,
      `/tmdb-api/movie/top_rated?api_key=275c9d09780aadb4b13ff57a731eda00&language=ru-RU&page=${1 + Math.floor(Math.random() * 5)}`,
      `/tmdb-api/movie/popular?api_key=275c9d09780aadb4b13ff57a731eda00&language=ru-RU&page=${1 + Math.floor(Math.random() * 5)}`,
    ];
    try {
      const responses = await Promise.all(pages.map(p => fetch(p).then(r => r.json()).catch(() => ({ results: [] }))));
      const merged: Movie[] = [];
      const seen = new Set<number>();
      for (const r of responses) {
        for (const m of (r.results || [])) {
          if (skip.has(m.id) || seen.has(m.id)) continue;
          if (!m.poster_path) continue;
          seen.add(m.id);
          merged.push(m);
        }
      }
      pool = merged.slice(0, 60);
    } catch {}
    setSpinPool(pool);
    return pool;
  };

  // Pre-warm the pool + preload a chunk of posters so the slot card
  // has visual content from the start AND spin animation doesn't show
  // broken/loading images.
  useEffect(() => {
    if (spinPool.length === 0) {
      buildPool().then(p => preloadPosters(p.slice(0, 12))).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setSpinPick(null);
    const pool = await buildPool();
    if (pool.length === 0) { setSpinning(false); return; }

    // Pick final NOW, preload its poster, then start the timer. By the
    // time the spin lands (2.2s later) the image is in browser cache so
    // it appears instantly without flash-of-broken-poster.
    const final = pool[Math.floor(Math.random() * pool.length)];
    if (final.poster_path) {
      await preloadOne(`${POSTER}/w500${final.poster_path}`).catch(() => {});
    }
    // Also preload a few cycling candidates so the animation looks rich
    preloadPosters(pool.slice(0, 10));

    setTimeout(() => {
      setSpinPick(final);
      setSpinning(false);
    }, 2200);
  };

  const pickMood = async (id: string) => {
    const mood = MOODS.find(m => m.id === id);
    if (!mood) return;
    setOpenMood(id);
    setLoading(true);
    setResults([]);
    try {
      const params = new URLSearchParams({
        api_key: "275c9d09780aadb4b13ff57a731eda00",
        language: "ru-RU",
        sort_by: "popularity.desc",
        with_genres: mood.genres.join("|"),
        "vote_average.gte": String(mood.minRating),
        "vote_count.gte": "200",
        page: String(1 + Math.floor(Math.random() * 5)), // shuffle pages so it varies
      });
      const res = await fetch(`/tmdb-api/discover/movie?${params}`);
      const data = await res.json();
      setResults((data.results || []).slice(0, 12));
    } catch {} finally { setLoading(false); }
  };

  const closeMood = () => { setOpenMood(null); setResults([]); };

  return (
    <section className="grid grid-cols-1 lg:grid-cols-[1fr_440px] gap-5">
      {/* ── Mood picker (left, big) ────────────────────────────────── */}
      <div className="relative rounded-3xl p-6 sm:p-7 bg-gradient-to-br from-foreground/[0.05] via-foreground/[0.02] to-foreground/[0.01] ring-1 ring-white/[0.06] overflow-hidden">
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-primary/[0.10] blur-3xl pointer-events-none" />
        <div className="absolute -bottom-20 -left-12 w-48 h-48 rounded-full bg-purple-500/[0.06] blur-3xl pointer-events-none" />

        <div className="relative">
          <h2 className="text-foreground font-black text-2xl tracking-tight">Что посмотреть сегодня?</h2>
          <p className="text-foreground/55 text-[13px] mt-1">Выбери настроение — подберём фильм за секунду</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-5">
            {MOODS.map(m => (
              <MoodTile key={m.id} mood={m} onClick={() => pickMood(m.id)} />
            ))}
          </div>

          {/* Selected mood results preview row */}
          {openMood && results.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-foreground font-bold text-[15px] flex items-center gap-2">
                  <span className="text-base">{MOODS.find(m => m.id === openMood)?.emoji}</span>
                  Для твоего настроения
                </h3>
                <button onClick={closeMood} className="text-foreground/55 text-[12px] font-medium hover:text-primary">Закрыть</button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {results.slice(0, 6).map(m => (
                  <Link key={m.id} href={`/movie/${m.id}`} className="group block">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/40 transition-all">
                      {m.poster_path && (
                        <Image src={`${POSTER}/w342${m.poster_path}`} alt={m.title || ""} fill sizes="180px" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                      )}
                      {m.vote_average && m.vote_average > 0 && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-amber-300 text-[10px] font-bold">★ {m.vote_average.toFixed(1)}</span>
                      )}
                    </div>
                    <p className="mt-1.5 text-foreground/85 text-[11.5px] font-semibold line-clamp-1 group-hover:text-primary">{m.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
          {openMood && loading && (
            <div className="mt-6 text-center py-8 text-foreground/55 text-[13px]">Подбираю…</div>
          )}
        </div>
      </div>

      {/* ── Roulette WHEEL (right, big circle with mood emojis) ────── */}
      <RouletteWheel
        spinning={spinning}
        spinPick={spinPick}
        spinPool={spinPool}
        onSpin={spin}
      />

    </section>
  );
}

/* ── Big mood tile button (gradient, emoji icon, lime selected ring) ── */
function MoodTile({ mood, onClick }: { mood: typeof MOODS[number]; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative rounded-2xl p-3.5 bg-gradient-to-b from-foreground/[0.06] to-foreground/[0.02] ring-1 ring-white/[0.06] hover:ring-primary/40 hover:bg-foreground/[0.08] hover:-translate-y-0.5 transition-all overflow-hidden"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)" }}
    >
      <div
        className="flex items-center justify-center w-11 h-11 rounded-full mb-2.5 ring-1 transition-transform group-hover:scale-110"
        style={{
          backgroundColor: `${mood.color}1f`,
          borderColor: `${mood.color}40`,
          boxShadow: `0 0 14px ${mood.color}40`,
        }}
      >
        <span className="text-2xl leading-none" aria-hidden>{mood.emoji}</span>
      </div>
      <div className="text-foreground font-bold text-[13px] leading-tight">{mood.label}</div>
      <div className="text-foreground/45 text-[10.5px] mt-0.5 line-clamp-1">{mood.subLabel}</div>
    </button>
  );
}

/* ── Wheel-of-fortune roulette ─────────────────────────────────
   Big circle with mood emojis around the perimeter + a center
   PLAY button. Click → wheel rotates fast then settles; the
   moviepicked from a pool of unwatched top-rated titles is shown
   in an inline poster card below. Inspired by reference image. */
function RouletteWheel({ spinning, spinPick, spinPool, onSpin }: {
  spinning: boolean;
  spinPick: Movie | null;
  spinPool: Movie[];
  onSpin: () => void;
}) {
  // Wheel rotation deg; resets on each spin. 8 full turns + offset.
  const [rotation, setRotation] = useState(0);
  useEffect(() => {
    if (spinning) {
      // Random landing offset (0-360) added to 8 full turns
      const offset = Math.floor(Math.random() * 360);
      setRotation(prev => prev + 8 * 360 + offset);
    }
  }, [spinning]);

  // Cycle which pool poster to show during spin animation (still used
  // for the bottom poster card so it doesn't sit static)
  const [cycleIdx, setCycleIdx] = useState(0);
  useEffect(() => {
    if (!spinning || spinPool.length === 0) return;
    let i = 0;
    const id = setInterval(() => {
      i++;
      setCycleIdx(Math.floor(Math.random() * spinPool.length));
    }, 90);
    return () => clearInterval(id);
  }, [spinning, spinPool.length]);

  // Mood segments to render around the wheel
  const segments = MOODS.slice(0, 6);
  // Wheel size
  const SIZE = 280;
  const RADIUS = SIZE / 2 - 24; // emoji placement radius

  return (
    <div className="relative rounded-3xl p-6 bg-gradient-to-br from-foreground/[0.05] via-foreground/[0.02] to-foreground/[0.01] ring-1 ring-white/[0.06] overflow-hidden flex flex-col">
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/[0.10] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-purple-500/[0.06] blur-3xl pointer-events-none" />

      <div className="relative flex items-center justify-between gap-3 mb-1">
        <h2 className="text-foreground font-black text-2xl tracking-tight">Помоги выбрать фильм <span aria-hidden>🎲</span></h2>
      </div>
      <p className="relative text-foreground/55 text-[13px] mb-4">Запусти рулетку — пусть удача решит!</p>

      {/* The wheel itself */}
      <div className="relative flex items-center justify-center my-2" style={{ height: SIZE }}>
        {/* Outer ambient glow */}
        <div className="absolute w-[300px] h-[300px] rounded-full bg-primary/[0.15] blur-2xl pointer-events-none" />

        {/* Rotating ring with segments + emoji labels */}
        <div
          className="absolute"
          style={{
            width: SIZE, height: SIZE,
            transform: `rotate(${rotation}deg)`,
            transition: spinning ? "transform 2.4s cubic-bezier(.15,.7,.15,1)" : "none",
          }}
        >
          {/* Conic gradient ring (6 segments alternating shades) */}
          <div
            className="absolute inset-0 rounded-full"
            style={{
              background: `conic-gradient(from 0deg,
                rgba(163,230,53,0.25) 0deg 60deg,
                rgba(163,230,53,0.12) 60deg 120deg,
                rgba(163,230,53,0.25) 120deg 180deg,
                rgba(163,230,53,0.12) 180deg 240deg,
                rgba(163,230,53,0.25) 240deg 300deg,
                rgba(163,230,53,0.12) 300deg 360deg)`,
              boxShadow: "0 0 40px rgba(163,230,53,0.2), inset 0 0 0 2px rgba(163,230,53,0.35)",
            }}
          />
          {/* Divider lines between segments */}
          {segments.map((_, i) => (
            <div
              key={i}
              className="absolute top-1/2 left-1/2 origin-left h-px bg-primary/30"
              style={{
                width: SIZE / 2,
                transform: `rotate(${i * 60}deg)`,
              }}
            />
          ))}
          {/* Mood emoji + label per segment, placed on radius */}
          {segments.map((m, i) => {
            // angle in DEGREES centered in each 60° wedge, starting at top
            const angleDeg = i * 60 + 30 - 90;
            const rad = (angleDeg * Math.PI) / 180;
            const x = Math.cos(rad) * RADIUS;
            const y = Math.sin(rad) * RADIUS;
            return (
              <div
                key={m.id}
                className="absolute flex flex-col items-center"
                style={{
                  left: `calc(50% + ${x}px)`,
                  top: `calc(50% + ${y}px)`,
                  transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
                  transition: spinning ? "transform 2.4s cubic-bezier(.15,.7,.15,1)" : "none",
                }}
              >
                <span className="text-2xl leading-none drop-shadow-lg" aria-hidden>{m.emoji}</span>
                <span className="text-white/85 text-[10px] font-semibold mt-1 whitespace-nowrap">
                  {m.label.replace("Хочу ", "").replace("Чувствую ", "")}
                </span>
              </div>
            );
          })}
        </div>

        {/* Center play button — fixed, doesn't rotate */}
        <button
          onClick={onSpin}
          disabled={spinning}
          className="relative z-10 inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary text-primary-foreground font-bold hover:scale-105 active:scale-95 transition-transform disabled:opacity-70"
          style={{
            boxShadow: "0 0 0 4px rgba(163,230,53,0.20), 0 0 28px rgba(163,230,53,0.55), 0 6px 24px -4px rgba(163,230,53,0.40)",
          }}
          aria-label="Крутить рулетку"
        >
          <Play size={28} fill="currentColor" className="ml-1" />
        </button>
      </div>

      {/* Picked title preview — appears below when spin settles */}
      {spinPick && !spinning && (
        <Link
          href={`/movie/${spinPick.id}`}
          className="relative mt-4 flex items-center gap-3 rounded-2xl bg-foreground/[0.04] ring-1 ring-primary/30 p-2.5 hover:bg-foreground/[0.06] transition-colors group"
          style={{ boxShadow: "0 0 24px -4px rgba(163,230,53,0.30)" }}
        >
          {spinPick.poster_path && (
            <div className="relative w-12 h-16 rounded-lg overflow-hidden flex-shrink-0">
              <Image src={`${POSTER}/w185${spinPick.poster_path}`} alt={spinPick.title || ""} fill sizes="48px" className="object-cover" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-foreground font-bold text-[13.5px] line-clamp-1 group-hover:text-primary">{spinPick.title || spinPick.name}</p>
            <div className="flex items-center gap-2 mt-1 text-[11px] text-foreground/55">
              {spinPick.vote_average ? <span className="text-amber-300 font-bold">★ {spinPick.vote_average.toFixed(1)}</span> : null}
              {spinPick.release_date && <span>{new Date(spinPick.release_date).getFullYear()}</span>}
            </div>
          </div>
          <Play size={16} fill="currentColor" className="text-primary group-hover:scale-110 transition-transform" />
        </Link>
      )}

      {/* Big spin button below the wheel */}
      <button
        onClick={onSpin}
        disabled={spinning}
        className="relative w-full mt-4 inline-flex items-center justify-center gap-2 h-13 py-4 rounded-2xl bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 active:scale-[0.98] transition-all disabled:opacity-60"
        style={{ boxShadow: "0 8px 28px -6px rgba(163,230,53,0.55)" }}
      >
        <Dices size={18} className={spinning ? "animate-spin" : ""} />
        {spinning ? "Крутится…" : spinPick ? "Крутить ещё" : "Крутить рулетку"}
      </button>
    </div>);
}

