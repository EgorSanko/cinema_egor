"use client";

import { useState, useEffect, useRef } from "react";
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

  // Build the spinner pool on first interaction — favorites + history
  // titles with rating 7+. Fallback: random from currently-trending.
  const buildPool = async (): Promise<Movie[]> => {
    if (spinPool.length > 0) return spinPool;
    let pool: Movie[] = [];
    try {
      const favRaw = localStorage.getItem("kino_favorites");
      const histRaw = localStorage.getItem("kino_history");
      const favs = favRaw ? JSON.parse(favRaw) : [];
      const hist = histRaw ? JSON.parse(histRaw) : [];
      const merged = [...favs, ...hist];
      const seen = new Set<string>();
      for (const m of merged) {
        const key = `${m.type ?? "movie"}-${m.id}`;
        if (seen.has(key)) continue;
        if ((m.vote_average ?? 0) < 7) continue;
        seen.add(key);
        pool.push({ id: m.id, title: m.title, poster_path: m.poster_path, vote_average: m.vote_average });
      }
    } catch {}
    if (pool.length < 5) {
      try {
        const res = await fetch("/tmdb-api/movie/top_rated?api_key=275c9d09780aadb4b13ff57a731eda00&language=ru-RU&page=1");
        const data = await res.json();
        pool = pool.concat((data.results || []).slice(0, 20));
      } catch {}
    }
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

      {/* Roulette */}
      <div className="relative rounded-2xl p-5 bg-gradient-to-br from-purple-500/[0.10] to-foreground/[0.01] ring-1 ring-purple-400/15 overflow-hidden lg:w-[280px]">
        <div className="absolute -top-10 -left-10 w-32 h-32 rounded-full bg-purple-500/[0.15] blur-3xl pointer-events-none" />
        <div className="relative flex items-center gap-2 mb-3">
          <Dices size={16} className="text-purple-300" />
          <h2 className="text-foreground font-bold text-[15px]">Помоги выбрать</h2>
        </div>
        <p className="text-foreground/55 text-[12px] mb-4">Случайка из твоего топа и фаворитов</p>
        {spinPick ? (
          <Link href={`/movie/${spinPick.id}`} className="block">
            <div className={`relative aspect-[16/9] rounded-xl overflow-hidden bg-foreground/[0.05] ring-1 ring-white/[0.06] mb-3 ${spinning ? "blur-sm" : ""}`}>
              {spinPick.poster_path && (
                <Image
                  src={`${POSTER}/w500${spinPick.poster_path}`}
                  alt={spinPick.title || spinPick.name || ""}
                  fill
                  sizes="280px"
                  className="object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
              <div className="absolute bottom-2 left-3 right-3">
                <p className="text-white text-[13px] font-bold line-clamp-1">{spinPick.title || spinPick.name}</p>
              </div>
              {!spinning && (
                <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                  <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center">
                    <Play size={18} fill="currentColor" className="text-primary-foreground" />
                  </div>
                </div>
              )}
            </div>
          </Link>
        ) : (
          <div className="aspect-[16/9] rounded-xl border-2 border-dashed border-white/[0.08] mb-3 flex items-center justify-center text-foreground/30">
            <Dices size={32} />
          </div>
        )}
        <button
          onClick={spin}
          disabled={spinning}
          className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-full bg-purple-500/20 hover:bg-purple-500/30 ring-1 ring-purple-400/40 text-purple-100 text-[13px] font-semibold transition-all disabled:opacity-60"
        >
          <Dices size={14} className={spinning ? "animate-spin" : ""} />
          {spinning ? "Вертится…" : spinPick ? "Ещё раз" : "Крутить барабан"}
        </button>
      </div>

      {/* Mood results modal */}
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
