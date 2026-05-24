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
    if (m.poster_path) { preloadOne(`${POSTER}/w342${m.poster_path}`).catch(() => {}); }
  }
}

// CS:GO-style rarity tiers — colour + label per rating bucket
export function rarityOf(rating: number | undefined) {
  const r = rating ?? 0;
  if (r >= 8) return { color: "#fbbf24", glow: "rgba(251,191,36,0.55)",  label: "Легенда",  tier: 4 };
  if (r >= 7) return { color: "#ef4444", glow: "rgba(239,68,68,0.55)",   label: "Эпик",     tier: 3 };
  if (r >= 6) return { color: "#a78bfa", glow: "rgba(167,139,250,0.55)", label: "Редкий",   tier: 2 };
  return         { color: "#3b82f6", glow: "rgba(59,130,246,0.55)",  label: "Обычный",  tier: 1 };
}

export function MoodAndRoulette() {
  const [openMood, setOpenMood] = useState<string | null>(null);
  const [results, setResults] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [spinPick, setSpinPick] = useState<Movie | null>(null);
  const [spinPool, setSpinPool] = useState<Movie[]>([]);
  // Default "Для твоего настроения" row — trending picks shown when no
  // mood is picked yet so the card doesn't have empty space below the
  // mood grid. Loaded once on mount.
  const [trending, setTrending] = useState<Movie[]>([]);
  useEffect(() => {
    fetch("/tmdb-api/trending/movie/week?api_key=275c9d09780aadb4b13ff57a731eda00&language=ru-RU")
      .then(r => r.json())
      .then(d => setTrending((d.results || []).filter((m: any) => m.poster_path).slice(0, 6)))
      .catch(() => {});
  }, []);

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
    // Clear previous pick FIRST so CaseRoulette useEffect sees pick=null
    // → spinning=true with new pick (fresh dependency change). Without
    // this, repeated spins where the new pick equals... no, irrelevant
    // because we always re-pick random — but the order matters for
    // strip rebuild reliability.
    setSpinPick(null);
    setSpinning(true);

    const pool = await buildPool();
    if (pool.length === 0) { setSpinning(false); return; }

    // Decide the winner NOW (not after timeout). CaseRoulette will see
    // {spinning:true, spinPick:final} → rebuild strip with winner pinned
    // at WINNER_INDEX → animate translate from 0 to winner position.
    // This fixes the "wrong card shown after stop" bug: previously the
    // strip was built with random items, then rebuilt AFTER stop when
    // pick arrived → image at center swapped post-animation.
    const final = pool[Math.floor(Math.random() * pool.length)];
    if (final.poster_path) {
      await preloadOne(`${POSTER}/w342${final.poster_path}`).catch(() => {});
    }
    preloadPosters(pool.slice(0, 10));

    setSpinPick(final);
    // 5.5s = matches CSS transition duration in CaseRoulette
    setTimeout(() => setSpinning(false), 5500);
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
    <section className="space-y-5">
      {/* ── CS:GO-style case roulette (FULL WIDTH — strip needs room) ── */}
      <CaseRoulette
        spinning={spinning}
        spinPick={spinPick}
        spinPool={spinPool}
        onSpin={spin}
      />

      {/* ── Mood picker (full width, mood-filtered or trending row inline) */}
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

          {/* Movie row — fills the space below the mood grid. Shows either:
              (a) Mood-filtered picks if user clicked a mood
              (b) Default trending if nothing picked yet (so the card never
                  has empty whitespace under the grid) */}
          {(() => {
            const items = openMood ? results : trending;
            const title = openMood ? "Для твоего настроения" : "Хиты недели";
            const emoji = openMood ? MOODS.find(m => m.id === openMood)?.emoji : "🔥";
            if (openMood && loading) {
              return <div className="mt-6 text-center py-8 text-foreground/55 text-[13px]">Подбираю…</div>;
            }
            if (items.length === 0) return null;
            return (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-foreground font-bold text-[15px] flex items-center gap-2">
                    <span className="text-base">{emoji}</span>
                    {title}
                  </h3>
                  {openMood && <button onClick={closeMood} className="text-foreground/55 text-[12px] font-medium hover:text-primary">Сбросить</button>}
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                  {items.slice(0, 6).map(m => (
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
            );
          })()}
        </div>
      </div>

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

/* ── CS:GO case-opening roulette ────────────────────────────────
   Horizontal strip of poster cards scrolls fast left → slows down
   → stops with a center indicator pointing at the winner. Each
   card has a rarity-colored bottom strip + glow based on TMDB
   rating: blue (<6) → purple (6-7) → red (7-8) → gold (8+).
   Reference: csgocases.com, key.gg, hellcase. */
function CaseRoulette({ spinning, spinPick, spinPool, onSpin }: {
  spinning: boolean;
  spinPick: Movie | null;
  spinPool: Movie[];
  onSpin: () => void;
}) {
  const CARD_W = 130;
  const GAP = 8;
  const STEP = CARD_W + GAP;
  const STRIP_LEN = 80;
  const WINNER_INDEX = 70; // far enough that scroll feels long

  // Internal strip + animation state. State-machine pattern used by
  // every CS:GO case site: build strip → snap to 0 (no transition) →
  // RAF tick later set transition + target offset → element animates.
  //
  // This fixes TWO bugs from the previous useMemo approach:
  // 1. Strip rebuilt AFTER spin landed (when spinPick arrived) — image
  //    at center swapped post-animation. Now strip is built with the
  //    winner pinned from the very first frame of spinning.
  // 2. Second spin had transform already at target → CSS transition
  //    didn't fire → no animation. Now we explicitly snap back to 0
  //    then animate to new target so the diff always triggers transition.
  const [strip, setStrip] = useState<Movie[]>([]);
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);

  // Idle preview: when pool loads but no spin happened yet, show
  // some posters so the strip isn't empty
  useEffect(() => {
    if (strip.length === 0 && spinPool.length > 0) {
      const initial: Movie[] = [];
      for (let i = 0; i < 20; i++) {
        initial.push(spinPool[Math.floor(Math.random() * spinPool.length)]);
      }
      setStrip(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinPool]);

  // On a new spin: rebuild strip with winner pinned, snap to 0, then
  // (after browser commits the reset) animate to the winner position.
  useEffect(() => {
    if (!spinning || !spinPick || spinPool.length === 0) return;

    // 1. Build fresh strip with winner at WINNER_INDEX
    const newStrip: Movie[] = [];
    for (let i = 0; i < STRIP_LEN; i++) {
      newStrip.push(spinPool[Math.floor(Math.random() * spinPool.length)]);
    }
    newStrip[WINNER_INDEX] = spinPick;
    setStrip(newStrip);

    // 2. Reset position WITHOUT transition
    setTransitioning(false);
    setOffset(0);

    // 3. After browser paints the reset, enable transition + scroll
    const id = setTimeout(() => {
      const jitter = Math.floor(Math.random() * 40) - 20;
      const target = -(WINNER_INDEX * STEP) + jitter;
      setTransitioning(true);
      setOffset(target);
    }, 60);

    return () => clearTimeout(id);
  }, [spinning, spinPick, spinPool]);

  return (
    <div className="relative rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-foreground/[0.06] via-foreground/[0.02] to-foreground/[0.01] ring-1 ring-white/[0.06] overflow-hidden flex flex-col">
      {/* Ambient glows */}
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/[0.10] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -left-16 w-64 h-64 rounded-full bg-purple-500/[0.06] blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="relative flex items-center justify-between gap-3 mb-1">
        <h2 className="text-foreground font-black text-2xl tracking-tight flex items-center gap-2">
          <span aria-hidden>🎰</span> Рулетка
        </h2>
        {/* Rarity legend */}
        <div className="hidden sm:flex items-center gap-2 text-[10px] font-bold">
          {[
            { c: "#3b82f6", l: "<6" },
            { c: "#a78bfa", l: "6+" },
            { c: "#ef4444", l: "7+" },
            { c: "#fbbf24", l: "8+" },
          ].map(t => (
            <span key={t.l} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded" style={{ backgroundColor: `${t.c}20`, color: t.c }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: t.c, boxShadow: `0 0 6px ${t.c}` }} />
              {t.l}
            </span>
          ))}
        </div>
      </div>
      <p className="relative text-foreground/55 text-[12.5px] mb-4">Открой кейс — выпадет случайный фильм. Чем выше рейтинг — тем реже!</p>

      {/* Strip container */}
      <div
        className="relative rounded-2xl overflow-hidden bg-gradient-to-b from-black/60 to-black/40 ring-1 ring-white/[0.08] mb-4"
        style={{ height: 220 }}
      >
        {/* The strip */}
        {strip.length > 0 ? (
          <div
            className="absolute top-0 bottom-0 flex items-center"
            style={{
              // Start with first card's CENTER under the container center
              // (the indicator). Then offset slides the strip left until the
              // winning card's center is under the indicator too.
              paddingLeft: `calc(50% - ${CARD_W / 2}px)`,
              transform: `translateX(${offset}px)`,
              transition: transitioning
                ? "transform 5.5s cubic-bezier(.15,.85,.25,1)"
                : "none",
              willChange: "transform",
              gap: `${GAP}px`,
            }}
          >
            {strip.map((m, i) => {
              const r = rarityOf(m.vote_average);
              const isWinner = !spinning && spinPick && i === WINNER_INDEX;
              return (
                <div
                  key={i}
                  className="relative flex-shrink-0 rounded-xl overflow-hidden"
                  style={{
                    width: CARD_W,
                    aspectRatio: "2 / 3",
                    border: `2px solid ${r.color}`,
                    boxShadow: isWinner
                      ? `0 0 0 4px ${r.color}, 0 0 32px ${r.glow}, 0 0 64px ${r.glow}`
                      : `0 0 12px ${r.glow}`,
                    transform: isWinner ? "scale(1.04)" : "none",
                    transition: "box-shadow 0.4s, transform 0.4s",
                  }}
                >
                  {m.poster_path && (
                    <Image
                      src={`${POSTER}/w342${m.poster_path}`}
                      alt=""
                      fill
                      sizes="140px"
                      className="object-cover"
                      priority={i < 8 || Math.abs(i - WINNER_INDEX) <= 3}
                    />
                  )}
                  {/* Rarity bottom strip */}
                  <div
                    className="absolute bottom-0 inset-x-0 h-1"
                    style={{ backgroundColor: r.color, boxShadow: `0 0 12px ${r.glow}` }}
                  />
                  {/* Rating chip top-right */}
                  {m.vote_average && (
                    <span
                      className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-black"
                      style={{ backgroundColor: r.color, color: "#0a0a0a" }}
                    >
                      {m.vote_average.toFixed(1)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-foreground/30">
            <Dices size={40} />
            <p className="text-[12px]">Подгружаем кейс…</p>
          </div>
        )}

        {/* Center indicator — vertical line + triangles top/bottom */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-primary pointer-events-none z-20"
          style={{ boxShadow: "0 0 14px rgba(163,230,53,0.9), 0 0 28px rgba(163,230,53,0.5)" }}
        />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20"
          style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderTop: "10px solid #a3e635", filter: "drop-shadow(0 0 6px rgba(163,230,53,0.9))" }}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20"
          style={{ width: 0, height: 0, borderLeft: "8px solid transparent", borderRight: "8px solid transparent", borderBottom: "10px solid #a3e635", filter: "drop-shadow(0 0 6px rgba(163,230,53,0.9))" }}
        />

        {/* Edge fades for cinema-feel */}
        <div className="absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-black/80 via-black/40 to-transparent pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-black/80 via-black/40 to-transparent pointer-events-none z-10" />
      </div>

      {/* Winner banner — appears when spin settles */}
      {spinPick && !spinning && (() => {
        const r = rarityOf(spinPick.vote_average);
        return (
          <Link
            href={`/movie/${spinPick.id}`}
            className="relative flex items-center gap-3 rounded-2xl p-2.5 mb-3 ring-1 group transition-all"
            style={{
              backgroundColor: `${r.color}10`,
              borderColor: r.color,
              boxShadow: `0 0 24px ${r.glow}`,
            }}
          >
            {spinPick.poster_path && (
              <div className="relative w-12 h-16 rounded-lg overflow-hidden flex-shrink-0">
                <Image src={`${POSTER}/w185${spinPick.poster_path}`} alt={spinPick.title || ""} fill sizes="48px" className="object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded" style={{ backgroundColor: r.color, color: "#0a0a0a" }}>
                  {r.label}
                </span>
                {spinPick.vote_average ? (
                  <span className="text-[11px] font-bold" style={{ color: r.color }}>★ {spinPick.vote_average.toFixed(1)}</span>
                ) : null}
              </div>
              <p className="text-foreground font-bold text-[13.5px] line-clamp-1 group-hover:text-primary mt-0.5">{spinPick.title || spinPick.name}</p>
            </div>
            <Play size={18} fill="currentColor" style={{ color: r.color }} className="group-hover:scale-110 transition-transform" />
          </Link>
        );
      })()}

      {/* Open case button */}
      <button
        onClick={onSpin}
        disabled={spinning}
        className="relative w-full inline-flex items-center justify-center gap-2 h-13 py-3.5 rounded-2xl bg-gradient-to-r from-primary via-yellow-300 to-primary text-primary-foreground font-black text-[15px] tracking-wider uppercase hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
        style={{
          backgroundSize: "200% 100%",
          animation: spinning ? "case-flow 1.2s linear infinite" : undefined,
          boxShadow: "0 8px 28px -6px rgba(163,230,53,0.55), 0 0 24px rgba(163,230,53,0.25)",
        }}
      >
        <Dices size={18} className={spinning ? "animate-spin" : ""} />
        {spinning ? "Открываем…" : spinPick ? "Открыть ещё раз" : "Открыть кейс"}
      </button>

      <style jsx>{`
        @keyframes case-flow {
          to { background-position: -200% 0; }
        }
      `}</style>
    </div>);
}


