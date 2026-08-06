"use client";

import { useEffect, useMemo, useState } from "react";
import { Navbar } from "@/components/navbar";
import { getHistory, getFavorites, syncFromServer } from "@/lib/storage";
import { computeStats } from "@/lib/achievements";
import { getGenreLookup, GENRES, pickPersona } from "@/lib/genre-persona";
import { enrichHistoryWithGenres } from "@/lib/genre-enrich";
import { useAuth } from "@/components/auth-context";
import Image from "next/image";
import Link from "next/link";
import { Trophy, Clock, Tv as TvIcon, Film, Heart, Share2, Calendar, Flame } from "lucide-react";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

export default function WrappedPage() {
  const { user } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let cancelled = false;
    const load = async () => {
      // For logged users pull canonical data from server first — local history
      // can be stale because of the old addToHistory dedupe bug (single row
      // per TV series). Server merges by id+type+season+episode so it holds
      // the full per-episode picture.
      if (user?.email) {
        try { await syncFromServer(user.email); } catch {}
      }
      if (cancelled) return;
      const h = getHistory();
      setFavorites(getFavorites());
      enrichHistoryWithGenres(h).then(out => { if (!cancelled) setHistory(out); });
    };
    load();
    return () => { cancelled = true; };
  }, [user?.email]);

  const year = new Date().getFullYear();
  const yearStart = new Date(year, 0, 1).getTime();
  const yearEnd = new Date(year + 1, 0, 1).getTime();

  const yearHistory = useMemo(
    () => history.filter(h => h.watchedAt >= yearStart && h.watchedAt < yearEnd),
    [history, yearStart, yearEnd]
  );

  const genreLookup = useMemo(() => getGenreLookup(), []);
  const stats = useMemo(() => computeStats(yearHistory, favorites, genreLookup), [yearHistory, favorites, genreLookup]);

  // Top 5 most watched titles by total minutes.
  // count = distinct episodes for TV / 1 for movie. Skip rows under 60s so
  // tap-ins don't inflate the "138 сеансов" you never actually watched.
  const topTitles = useMemo(() => {
    const map = new Map<string, { id: number; type: string; title: string; poster_path: string | null; minutes: number; episodes: Set<string>; movieWatched: boolean }>();
    for (const h of yearHistory) {
      if (!h.duration || !h.progress || h.progress < 60) continue;
      const key = `${h.type}-${h.id}`;
      const min = (h.progress / 60);
      const prev = map.get(key);
      if (prev) {
        prev.minutes += min;
        if (h.type === "tv") prev.episodes.add(`s${h.season ?? 0}e${h.episode ?? 0}`);
        else prev.movieWatched = true;
      } else {
        const eps = new Set<string>();
        if (h.type === "tv") eps.add(`s${h.season ?? 0}e${h.episode ?? 0}`);
        map.set(key, { id: h.id, type: h.type, title: h.title, poster_path: h.poster_path, minutes: min, episodes: eps, movieWatched: h.type === "movie" });
      }
    }
    return [...map.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 5)
      .map(t => ({ ...t, count: t.type === "tv" ? t.episodes.size : 1 }));
  }, [yearHistory]);

  // Russian plural for n (1 → one, 2-4 → few, 5+/0/11-14 → many)
  const ruPlural = (n: number, one: string, few: string, many: string) => {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
    return many;
  };

  // Top genres breakdown
  const topGenres = useMemo(() => {
    const entries = Object.entries(stats.byGenre || {})
      .filter(([, c]) => (c as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    const total = entries.reduce((s, [, c]) => s + (c as number), 0);
    return entries.map(([name, count]) => ({
      name,
      pct: total ? Math.round(((count as number) / total) * 100) : 0,
    }));
  }, [stats]);

  // Big day — when did user binge the most?
  const bigDay = useMemo(() => {
    const perDay = new Map<string, number>();
    for (const h of yearHistory) {
      const day = new Date(h.watchedAt).toISOString().slice(0, 10);
      perDay.set(day, (perDay.get(day) || 0) + 1);
    }
    let best: { day: string; count: number } | null = null;
    for (const [day, count] of perDay) {
      if (!best || count > best.count) best = { day, count };
    }
    if (!best || best.count < 2) return null;
    const d = new Date(best.day);
    const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
    return { label: `${d.getDate()} ${months[d.getMonth()]}`, count: best.count };
  }, [yearHistory]);

  // Persona (киноДНК)
  const persona = useMemo(() => pickPersona(topGenres.map(g => ({ name: g.name, count: 0, pct: g.pct }))), [topGenres]);

  const hours = Math.floor(stats.totalHoursWatched);
  const movies = stats.totalMoviesWatched;
  const episodes = stats.totalTvEpisodes;
  const days = Math.floor(stats.totalHoursWatched / 24);

  const share = async () => {
    const text = `Мой год в кино на sapkeflykino:\n${hours}ч просмотрено · ${movies} фильмов · ${episodes} серий\nПерсонаж: ${persona.title} ${persona.emoji}\nhttps://sapkeflykino.ru/wrapped`;
    try {
      if (navigator.share) await navigator.share({ title: `Мой год в кино ${year}`, text });
      else { await navigator.clipboard?.writeText(text); alert("Скопировано в буфер!"); }
    } catch {}
  };

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <span className="text-6xl">🎬</span>
            <h1 className="text-3xl font-bold text-foreground">Войдите чтобы увидеть свой год</h1>
            <p className="text-foreground/55">Год в кино — это твоя личная статистика. Войди и получи персональный отчёт.</p>
            <Link href="/" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold">На главную</Link>
          </div>
        </main>
      </>
    );
  }

  if (yearHistory.length === 0) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <span className="text-6xl">📺</span>
            <h1 className="text-3xl font-bold text-foreground">В {year} ещё пусто</h1>
            <p className="text-foreground/55">Посмотри несколько фильмов — и мы соберём твой год в кино.</p>
            <Link href="/" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold">Начать смотреть</Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="relative min-h-screen bg-background overflow-hidden pb-24">
        {/* Cinematic background blobs */}
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-primary/[0.12] blur-3xl pointer-events-none" />
        <div className="absolute top-1/3 right-0 w-[500px] h-[500px] rounded-full bg-purple-500/[0.10] blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full bg-amber-400/[0.08] blur-3xl pointer-events-none" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-20 space-y-8">

          {/* ── Hero ── */}
          <section className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/15 ring-1 ring-primary/30 text-primary text-[11px] font-bold uppercase tracking-widest">
              <Calendar size={11} /> Год в кино · {year}
            </div>
            <h1 className="text-5xl sm:text-7xl font-black text-foreground tracking-tight leading-[1.05]">
              {user.name},<br/>
              <span className="bg-gradient-to-r from-primary via-yellow-300 to-primary bg-clip-text text-transparent">это был твой год</span>
            </h1>
            <p className="text-foreground/55 text-sm">Жми «Поделиться» внизу — отправь свой отчёт друзьям</p>
          </section>

          {/* ── Mega stat: hours ── */}
          <WrappedCard accent>
            <div className="text-center py-4">
              <div className="text-foreground/55 text-[12px] uppercase tracking-wider font-semibold mb-1">Ты посмотрел</div>
              <div className="text-[6rem] sm:text-[8rem] font-black leading-none text-primary tabular-nums" style={{ textShadow: "0 0 60px rgba(163,230,53,0.4)" }}>
                {hours}
              </div>
              <div className="text-foreground text-2xl font-bold mt-1">{ruPlural(hours, "час", "часа", "часов")}</div>
              {days > 0 && <div className="text-foreground/45 text-[13px] mt-2">≈ {days} {ruPlural(days, "день", "дня", "дней")} без сна</div>}
            </div>
          </WrappedCard>

          {/* ── Counts row ── */}
          <div className="grid grid-cols-2 gap-3">
            <WrappedCard>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-primary/15 ring-1 ring-primary/30 text-primary flex items-center justify-center" style={{ boxShadow: "0 0 18px rgba(163,230,53,0.2)" }}>
                  <Film size={20} />
                </div>
                <div>
                  <div className="text-foreground text-3xl font-black tabular-nums">{movies}</div>
                  <div className="text-foreground/55 text-[12px]">фильмов</div>
                </div>
              </div>
            </WrappedCard>
            <WrappedCard>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-purple-500/15 ring-1 ring-purple-400/30 text-purple-300 flex items-center justify-center">
                  <TvIcon size={20} />
                </div>
                <div>
                  <div className="text-foreground text-3xl font-black tabular-nums">{episodes}</div>
                  <div className="text-foreground/55 text-[12px]">серий</div>
                </div>
              </div>
            </WrappedCard>
          </div>

          {/* ── Persona ── */}
          {persona.title !== "Кинопервопроходец" && (
            <WrappedCard>
              <div className="text-foreground/75 text-[12px] uppercase tracking-wider font-semibold mb-3">Твой персонаж</div>
              <div className="flex items-center gap-4">
                <span className="text-6xl leading-none">{persona.emoji}</span>
                <div>
                  <h2 className="text-foreground text-3xl font-black leading-tight">{persona.title}</h2>
                  <p className="text-foreground/65 text-sm mt-1">{persona.tagline}</p>
                </div>
              </div>
            </WrappedCard>
          )}

          {/* ── Top genres ── */}
          {topGenres.length > 0 && (
            <WrappedCard>
              <div className="text-foreground/75 text-[12px] uppercase tracking-wider font-semibold mb-4">Из чего сделан твой год</div>
              <ul className="space-y-2.5">
                {topGenres.map((g, i) => {
                  const entry = Object.values(GENRES).find(x => x.name === g.name);
                  return (
                    <li key={g.name} className="flex items-center gap-3">
                      <span className="text-2xl leading-none w-8 text-center">{entry?.emoji ?? "🎬"}</span>
                      <span className="text-foreground font-semibold text-[14px] w-[120px]">{g.name}</span>
                      <div className="flex-1 h-2.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-primary to-yellow-300 transition-[width] duration-1000" style={{ width: `${g.pct}%`, boxShadow: "0 0 10px rgba(163,230,53,0.5)" }} />
                      </div>
                      <span className="text-foreground font-bold text-[14px] tabular-nums w-10 text-right">{g.pct}%</span>
                    </li>
                  );
                })}
              </ul>
            </WrappedCard>
          )}

          {/* ── Top titles ── */}
          {topTitles.length > 0 && (
            <WrappedCard>
              <div className="text-foreground/75 text-[12px] uppercase tracking-wider font-semibold mb-4">Твой топ-5</div>
              <ol className="space-y-3">
                {topTitles.map((t, i) => (
                  <li key={`${t.type}-${t.id}`}>
                    <Link href={t.type === "tv" ? `/tv/${t.id}` : `/movie/${t.id}`} className="flex items-center gap-3 group">
                      <span className="text-4xl font-black text-primary/40 group-hover:text-primary transition-colors tabular-nums w-10 text-right">{i + 1}</span>
                      {t.poster_path && (
                        <div className="relative w-14 h-20 rounded-lg overflow-hidden ring-1 ring-white/10 flex-shrink-0">
                          <Image src={`${POSTER}/w185${t.poster_path}`} alt={t.title} fill sizes="56px" className="object-cover" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground font-bold text-[15px] line-clamp-1 group-hover:text-primary transition-colors">{t.title}</p>
                        <p className="text-foreground/45 text-[11px] mt-0.5">{Math.round(t.minutes / 60)}ч · {t.count} {
                          t.type === "tv"
                            ? ruPlural(t.count, "серия", "серии", "серий")
                            : ruPlural(t.count, "просмотр", "просмотра", "просмотров")
                        }</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ol>
            </WrappedCard>
          )}

          {/* ── Big binge day ── */}
          {bigDay && (
            <WrappedCard>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-orange-400/15 ring-1 ring-orange-400/30 text-orange-300 flex items-center justify-center">
                  <Flame size={24} />
                </div>
                <div>
                  <div className="text-foreground/75 text-[12px] uppercase tracking-wider font-semibold">Самый бомбический день</div>
                  <div className="text-foreground font-black text-2xl leading-tight">{bigDay.label}</div>
                  <div className="text-foreground/65 text-sm mt-0.5">{bigDay.count} серий/фильмов за день</div>
                </div>
              </div>
            </WrappedCard>
          )}

          {/* ── Streak ── */}
          {stats.consecutiveDays > 1 && (
            <WrappedCard>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-red-500/15 ring-1 ring-red-400/30 text-red-300 flex items-center justify-center">
                  <Flame size={24} />
                </div>
                <div>
                  <div className="text-foreground/75 text-[12px] uppercase tracking-wider font-semibold">Серия подряд</div>
                  <div className="text-foreground font-black text-2xl leading-tight">{stats.consecutiveDays} {ruPlural(stats.consecutiveDays, "день", "дня", "дней")}</div>
                  <div className="text-foreground/65 text-sm mt-0.5">Ты смотришь без перерыва</div>
                </div>
              </div>
            </WrappedCard>
          )}

          {/* ── Achievements unlocked this year ── */}
          {/* Skipping for now — would need unlockDates filtered by year */}

          {/* ── Share button ── */}
          <div className="text-center pt-4">
            <button
              onClick={share}
              className="inline-flex items-center gap-2 px-7 h-13 py-4 rounded-full bg-gradient-to-r from-primary to-yellow-300 text-primary-foreground font-bold text-base hover:scale-[1.02] transition-transform"
              style={{ boxShadow: "0 8px 32px -4px rgba(163,230,53,0.5)" }}
            >
              <Share2 size={18} /> Поделиться годом
            </button>
            <p className="text-foreground/40 text-[11px] mt-3">sapkeflykino.ru/wrapped</p>
          </div>
        </div>
      </main>
    </>
  );
}

function WrappedCard({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <div
      className={`relative rounded-3xl p-5 sm:p-6 ring-1 backdrop-blur-md transition-all ${
        accent
          ? "bg-gradient-to-br from-primary/[0.10] to-purple-500/[0.04] ring-primary/20"
          : "bg-gradient-to-b from-foreground/[0.04] to-foreground/[0.015] ring-white/[0.06]"
      }`}
      style={{ boxShadow: accent ? "0 8px 40px -8px rgba(163,230,53,0.20), inset 0 1px 0 rgba(255,255,255,0.04)" : "inset 0 1px 0 rgba(255,255,255,0.03)" }}
    >
      {children}
    </div>
  );
}
