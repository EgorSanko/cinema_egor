"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import Link from "next/link";
import Image from "next/image";
import { Sparkles, Dices, X, Play } from "lucide-react";

// TMDB genre IDs used by the mood filter. Each mood maps to one or
// more genres + a min vote_average so we don't pull garbage.
const MOODS: { id: string; label: string; emoji: string; genres: number[]; minRating: number; description: string }[] = [
  { id: "sad",   label: "Грустно",     emoji: "🌧️", genres: [18, 10749],       minRating: 7.0, description: "Драма, мелодрама" },
  { id: "fun",   label: "Весело",      emoji: "🎉", genres: [35, 16],          minRating: 6.5, description: "Комедия, мультфильм" },
  { id: "scary", label: "Страшно",     emoji: "👻", genres: [27, 53],          minRating: 6.5, description: "Ужасы, триллер" },
  { id: "chill", label: "Не думать",   emoji: "🧊", genres: [28, 12, 878],     minRating: 6.5, description: "Боевик, приключения" },
];

interface Movie {
  id: number; title?: string; name?: string;
  poster_path?: string | null; backdrop_path?: string | null;
  vote_average?: number;
  release_date?: string;
}

const POSTER = "https://sapkeflykino.ru/tmdb-img";

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

  // Pre-warm the pool so the slot card has visual content from the start
  useEffect(() => {
    if (spinPool.length === 0) buildPool().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setSpinPick(null);
    const pool = await buildPool();
    if (pool.length === 0) { setSpinning(false); return; }
    // The RouletteSlot child cycles its own visual during `spinning`. We
    // just need to wait the chosen duration and then commit the final pick.
    // 2.2s = enough time to build anticipation without dragging.
    setTimeout(() => {
      const final = pool[Math.floor(Math.random() * pool.length)];
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
    <section className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4">
      {/* Mood picker */}
      <div className="relative rounded-2xl p-5 bg-gradient-to-br from-foreground/[0.04] to-foreground/[0.01] ring-1 ring-white/[0.06] overflow-hidden">
        <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full bg-primary/[0.08] blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-3">
          <Sparkles size={16} className="text-primary" />
          <h2 className="text-foreground font-bold text-[15px]">Что посмотреть сегодня?</h2>
        </div>
        <p className="text-foreground/55 text-[12px] mb-4">Выбери настроение — подберём фильм за секунду</p>
        <div className="grid grid-cols-4 gap-2">
          {MOODS.map(m => (
            <button
              key={m.id}
              onClick={() => pickMood(m.id)}
              className="group relative rounded-xl px-2 py-3 bg-foreground/[0.03] ring-1 ring-white/[0.06] hover:ring-primary/40 hover:bg-foreground/[0.06] transition-all"
            >
              <div className="text-2xl mb-1 transition-transform group-hover:scale-110">{m.emoji}</div>
              <div className="text-foreground text-[11px] font-semibold">{m.label}</div>
              <div className="text-foreground/45 text-[9px] mt-0.5 line-clamp-1">{m.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Roulette — slot-machine style */}
      <RouletteSlot
        spinning={spinning}
        spinPick={spinPick}
        spinPool={spinPool}
        onSpin={spin}
      />

      {/* Mood results modal — overlays both cards */}
      {openMood && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={closeMood}>
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-3xl max-h-[85vh] rounded-2xl bg-background ring-1 ring-white/10 flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{MOODS.find(m => m.id === openMood)?.emoji}</span>
                <div>
                  <h2 className="text-foreground text-lg font-bold">Подборка под настроение</h2>
                  <p className="text-foreground/55 text-[12px] mt-0.5">{MOODS.find(m => m.id === openMood)?.description}</p>
                </div>
              </div>
              <button onClick={closeMood} className="w-9 h-9 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 flex items-center justify-center"><X size={16} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center py-12 text-foreground/55 text-[13px]">Подбираю…</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {results.map(m => (
                    <Link key={m.id} href={`/movie/${m.id}`} className="group block" onClick={closeMood}>
                      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/40 transition-all">
                        {m.poster_path && (
                          <Image src={`${POSTER}/w342${m.poster_path}`} alt={m.title || ""} fill sizes="200px" className="object-cover transition-transform group-hover:scale-105" />
                        )}
                        {m.vote_average && m.vote_average > 0 && (
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-amber-300 text-[10px] font-bold">★ {m.vote_average.toFixed(1)}</span>
                        )}
                      </div>
                      <p className="mt-1.5 text-foreground/85 text-[12px] font-semibold line-clamp-1 group-hover:text-primary">{m.title}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Tinder-style roulette card ─────────────────────────────────
   Big single poster (real aspect 2:3) that flips/swaps fast during
   spin then settles on the final pick. No more squished slot-strip —
   posters get their natural shape and the whole card has weight. */
function RouletteSlot({ spinning, spinPick, spinPool, onSpin }: {
  spinning: boolean;
  spinPick: Movie | null;
  spinPool: Movie[];
  onSpin: () => void;
}) {
  // Cycle which pool poster to show during spin animation
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

  // What we show in the big card right now
  const visible = spinPick && !spinning ? spinPick : spinPool[cycleIdx] || null;

  return (
    <div className="relative rounded-2xl p-5 bg-gradient-to-br from-purple-500/[0.14] via-purple-500/[0.05] to-foreground/[0.01] ring-1 ring-purple-400/25 overflow-hidden lg:w-[300px] flex flex-col">
      <div className="absolute -top-16 -left-16 w-44 h-44 rounded-full bg-purple-500/[0.20] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-16 w-48 h-48 rounded-full bg-primary/[0.12] blur-3xl pointer-events-none" />

      <div className="relative flex items-center gap-2 mb-1">
        <Dices size={15} className="text-purple-300" />
        <h2 className="text-foreground font-bold text-[14px]">Помоги выбрать</h2>
      </div>
      <p className="relative text-foreground/55 text-[11.5px] mb-4 leading-snug">Случайный фильм из топ-рейтинга, который ты ещё не смотрел</p>

      {/* Big poster card */}
      <div className="relative w-full mb-3" style={{ perspective: "1000px" }}>
        <div
          className={`relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.05] ring-1 ring-white/[0.08] transition-transform duration-300 ${spinning ? "scale-95" : "scale-100"}`}
          style={{
            boxShadow: spinPick && !spinning
              ? "0 16px 50px -8px rgba(163,230,53,0.45), 0 0 0 1px rgba(163,230,53,0.25)"
              : "0 8px 32px -8px rgba(0,0,0,0.6)",
          }}
        >
          {visible?.poster_path ? (
            <Image
              key={visible.id + (spinning ? `-${cycleIdx}` : "-settled")}
              src={`${POSTER}/w500${visible.poster_path}`}
              alt={visible.title || visible.name || ""}
              fill
              sizes="300px"
              className={`object-cover ${spinning ? "" : "transition-opacity duration-300"}`}
              priority
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-foreground/30">
              <Dices size={48} />
              <p className="text-[12px] font-medium">Жми «РОЛИК»</p>
            </div>
          )}

          {/* Bottom gradient + title overlay (only when settled) */}
          {spinPick && !spinning && (
            <>
              <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black via-black/70 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="text-white font-black text-[16px] leading-tight line-clamp-2 drop-shadow-lg">
                  {spinPick.title || spinPick.name}
                </p>
                <div className="flex items-center gap-2 mt-1.5 text-[11px]">
                  {spinPick.vote_average ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 font-bold ring-1 ring-amber-400/30">★ {spinPick.vote_average.toFixed(1)}</span>
                  ) : null}
                  {spinPick.release_date && <span className="text-white/65">{new Date(spinPick.release_date).getFullYear()}</span>}
                </div>
              </div>
            </>
          )}

          {/* Spinning state — vignette flash */}
          {spinning && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-black/20 pointer-events-none" />
              <div className="absolute inset-0 ring-2 ring-primary/40 ring-inset rounded-xl pointer-events-none" style={{ animation: "pulse-glow 0.4s ease-in-out infinite alternate" }} />
            </>
          )}
        </div>

        {/* Stacked card shadows behind = "deck" feel */}
        {!spinPick && !spinning && (
          <>
            <div className="absolute inset-0 -z-10 rounded-xl bg-foreground/[0.04] ring-1 ring-white/[0.04]" style={{ transform: "translate(4px, 4px) rotate(2deg)" }} />
            <div className="absolute inset-0 -z-20 rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.03]" style={{ transform: "translate(8px, 8px) rotate(4deg)" }} />
          </>
        )}
      </div>

      {/* Action row — Play link if picked, spin button */}
      {spinPick && !spinning ? (
        <div className="flex gap-2">
          <Link
            href={`/movie/${spinPick.id}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-11 rounded-full bg-primary text-primary-foreground font-bold text-[13px] hover:bg-primary/90 transition-all"
            style={{ boxShadow: "0 6px 20px -4px rgba(163,230,53,0.5)" }}
          >
            <Play size={14} fill="currentColor" /> Смотреть
          </Link>
          <button
            onClick={onSpin}
            disabled={spinning}
            className="inline-flex items-center justify-center w-11 h-11 rounded-full bg-purple-500/20 hover:bg-purple-500/30 ring-1 ring-purple-400/40 text-purple-200"
            title="Ещё раз"
          >
            <Dices size={16} />
          </button>
        </div>
      ) : (
        <button
          onClick={onSpin}
          disabled={spinning}
          className="relative w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-gradient-to-r from-primary via-yellow-300 to-primary text-primary-foreground font-black text-[14px] tracking-[0.2em] uppercase transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed overflow-hidden"
          style={{
            boxShadow: "0 8px 28px -4px rgba(163,230,53,0.55), 0 0 24px rgba(163,230,53,0.25)",
            backgroundSize: "200% 100%",
            animation: spinning ? "btn-flow 1s linear infinite" : undefined,
          }}
        >
          <Dices size={16} className={spinning ? "animate-spin" : ""} />
          {spinning ? "Крутится…" : "Крутить"}
        </button>
      )}

      <style jsx>{`
        @keyframes pulse-glow {
          from { box-shadow: inset 0 0 16px rgba(163,230,53,0.15); }
          to { box-shadow: inset 0 0 32px rgba(163,230,53,0.35); }
        }
        @keyframes btn-flow {
          to { background-position: -200% 0; }
        }
      `}</style>
    </div>);
}

