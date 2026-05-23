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

  const spin = async () => {
    if (spinning) return;
    setSpinning(true);
    setSpinPick(null);
    const pool = await buildPool();
    if (pool.length === 0) { setSpinning(false); return; }
    // Animate by cycling 18 random picks fast, then settle on final
    let i = 0;
    const totalCycles = 18;
    const interval = setInterval(() => {
      const m = pool[Math.floor(Math.random() * pool.length)];
      setSpinPick(m);
      i++;
      if (i >= totalCycles) {
        clearInterval(interval);
        const final = pool[Math.floor(Math.random() * pool.length)];
        setSpinPick(final);
        setSpinning(false);
      }
    }, 80);
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

/* ── Slot-machine roulette ─────────────────────────────────────
   Cinematic poster carousel that scrolls fast then settles on the
   final pick. The "winning" item lands behind a center indicator
   (vertical neon line). Big poster, big CTA, very Steam-roulette. */
function RouletteSlot({ spinning, spinPick, spinPool, onSpin }: {
  spinning: boolean;
  spinPick: Movie | null;
  spinPool: Movie[];
  onSpin: () => void;
}) {
  // Build a long shuffled strip when pool changes — used during animation
  const strip = useMemo(() => {
    if (spinPool.length === 0) return [] as Movie[];
    const out: Movie[] = [];
    // 40 items: 4× repeated, last one is the pick — so it lands center
    for (let i = 0; i < 40; i++) out.push(spinPool[Math.floor(Math.random() * spinPool.length)]);
    if (spinPick) out[35] = spinPick; // index 35 lands center after settle
    return out;
  }, [spinPool, spinPick]);

  return (
    <div className="relative rounded-2xl p-5 bg-gradient-to-br from-purple-500/[0.12] to-foreground/[0.01] ring-1 ring-purple-400/20 overflow-hidden lg:w-[420px]">
      <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-purple-500/[0.20] blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-10 w-40 h-40 rounded-full bg-primary/[0.10] blur-3xl pointer-events-none" />
      <div className="relative flex items-center gap-2 mb-1.5">
        <Dices size={16} className="text-purple-300" />
        <h2 className="text-foreground font-bold text-[15px]">Помоги выбрать</h2>
      </div>
      <p className="text-foreground/55 text-[12px] mb-4">Случайный фильм из топ-рейтинга, который ты ещё не смотрел</p>

      {/* Slot strip */}
      <div className="relative aspect-[5/3] rounded-xl overflow-hidden bg-black ring-1 ring-white/[0.08] mb-3">
        {/* Strip background with fade edges */}
        <div className="absolute inset-0 flex items-center"
             style={{
               transform: spinning ? "translateX(-3000px)" : spinPick ? "translateX(-3360px)" : "translateX(0)",
               transition: spinning ? "transform 2.6s cubic-bezier(.05,.7,.1,1)" : spinPick ? "transform 0.6s cubic-bezier(.2,.7,.2,1)" : "none",
             }}>
          {strip.map((m, i) => (
            <div key={i} className="relative h-full w-[105px] flex-shrink-0">
              {m.poster_path && (
                <Image src={`${POSTER}/w185${m.poster_path}`} alt="" fill sizes="105px" className="object-cover" />
              )}
            </div>
          ))}
        </div>
        {/* Center indicator line + glow */}
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-primary pointer-events-none z-10" style={{ boxShadow: "0 0 16px rgba(163,230,53,0.8), 0 0 32px rgba(163,230,53,0.4)" }} />
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[110px] ring-2 ring-primary/40 ring-inset rounded-md pointer-events-none z-10" />
        {/* Edge fades */}
        <div className="absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-black to-transparent pointer-events-none z-10" />
        <div className="absolute inset-y-0 right-0 w-1/4 bg-gradient-to-l from-black to-transparent pointer-events-none z-10" />

        {/* Empty / initial state overlay */}
        {!spinning && !spinPick && strip.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-20 text-foreground/40">
            <Dices size={32} />
            <p className="text-[11px]">Жми «РОЛИК» чтобы крутить</p>
          </div>
        )}
      </div>

      {/* Winning title bar */}
      {spinPick && !spinning && (
        <Link href={`/movie/${spinPick.id}`} className="block mb-3 rounded-xl bg-gradient-to-r from-primary/15 to-primary/5 ring-1 ring-primary/30 px-3 py-2.5 group hover:bg-primary/20 transition-colors">
          <p className="text-foreground font-bold text-[14px] line-clamp-1 group-hover:text-primary">{spinPick.title || spinPick.name}</p>
          <div className="flex items-center gap-2 mt-1 text-[10.5px] text-foreground/55">
            {spinPick.vote_average && <span className="text-amber-300 font-bold">★ {spinPick.vote_average.toFixed(1)}</span>}
            {spinPick.release_date && <span>{new Date(spinPick.release_date).getFullYear()}</span>}
            <span className="ml-auto text-primary font-semibold inline-flex items-center gap-1">Смотреть <Play size={11} fill="currentColor" /></span>
          </div>
        </Link>
      )}

      <button
        onClick={onSpin}
        disabled={spinning}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-full bg-gradient-to-r from-primary to-yellow-300 text-primary-foreground font-black text-[14px] tracking-wider uppercase transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
        style={{ boxShadow: "0 6px 24px -4px rgba(163,230,53,0.5)" }}
      >
        <Dices size={16} className={spinning ? "animate-spin" : ""} />
        {spinning ? "Крутится…" : spinPick ? "Ещё раз" : "РОЛИК"}
      </button>
    </div>);
}

