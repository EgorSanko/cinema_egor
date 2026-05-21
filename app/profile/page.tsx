"use client";

import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getFavorites, getHistory } from "@/lib/storage";
import { computeStats, evaluateAchievements, type UnlockedAchievement } from "@/lib/achievements";
import { useEffect, useMemo, useState } from "react";
import {
  LogIn, LogOut, Heart, Clock, Award, Film, Tv, Trophy, Lock,
  Flame, Flag, TrendingUp, AudioLines, ArrowRight, Play, Bookmark,
  Star, CheckCircle2, ChevronDown, Crown, Sparkles, Zap,
} from "lucide-react";
import { AchievementIcon } from "@/lib/achievement-icons";
import Link from "next/link";
import Image from "next/image";

const UNLOCK_DATES_KEY = "kino_achievement_dates";
const POSTER_BASE = "https://sapkeflykino.ru/tmdb-img";

function readUnlockDates(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try { return JSON.parse(localStorage.getItem(UNLOCK_DATES_KEY) || "{}"); } catch { return {}; }
}

function writeUnlockDates(d: Record<string, string>) {
  try { localStorage.setItem(UNLOCK_DATES_KEY, JSON.stringify(d)); } catch {}
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const day = 86400_000;
  if (diff < 60_000) return "только что";
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  if (diff < day) {
    const h = new Date(ts).getHours();
    const m = new Date(ts).getMinutes();
    return `Сегодня в ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  if (diff < 2 * day) {
    const h = new Date(ts).getHours();
    const m = new Date(ts).getMinutes();
    return `Вчера в ${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }
  const d = new Date(ts);
  const months = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${d.getDate()} ${months[d.getMonth()]} в ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Rarity tiers for achievements — used to apply different glow / border /
// gradient styles. Mapped from achievement target difficulty.
type Rarity = "common" | "rare" | "epic" | "legendary";
function rarityFor(ach: UnlockedAchievement): Rarity {
  if (ach.target >= 100) return "legendary";
  if (ach.target >= 25) return "epic";
  if (ach.target >= 5) return "rare";
  return "common";
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState<any[]>([]);
  const [favorites, setFavorites] = useState<any[]>([]);
  const [unlockDates, setUnlockDates] = useState<Record<string, string>>({});
  const [showAllAch, setShowAllAch] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
    setFavorites(getFavorites());
    setUnlockDates(readUnlockDates());
    const refresh = () => {
      setHistory(getHistory());
      setFavorites(getFavorites());
      setUnlockDates(readUnlockDates());
    };
    window.addEventListener("sync-complete", refresh);
    window.addEventListener("favorites-changed", refresh);
    return () => {
      window.removeEventListener("sync-complete", refresh);
      window.removeEventListener("favorites-changed", refresh);
    };
  }, []);

  const stats = useMemo(() => computeStats(history, favorites), [history, favorites]);
  const achievements = useMemo(() => evaluateAchievements(stats), [stats]);
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const progressPct = achievements.length ? (unlockedCount / achievements.length) * 100 : 0;

  useEffect(() => {
    const dates = readUnlockDates();
    const todayIso = new Date().toISOString();
    let changed = false;
    for (const a of achievements) {
      if (a.unlocked && !dates[a.id]) {
        dates[a.id] = todayIso;
        changed = true;
      }
    }
    if (changed) {
      writeUnlockDates(dates);
      setUnlockDates(dates);
    }
  }, [achievements]);

  // Posters for hero collage — up to 12 unique recent watches
  const heroPosters = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const h of history) {
      const key = `${h.type}-${h.id}`;
      if (seen.has(key)) continue;
      const p = h.backdrop_path || h.poster_path;
      if (!p) continue;
      seen.add(key);
      out.push(p);
      if (out.length >= 12) break;
    }
    return out;
  }, [history]);

  // Continue watching: items not finished
  const continueWatching = useMemo(() => {
    const unfinished = history.filter((h: any) => {
      if (!h.duration || !h.progress) return false;
      const pct = (h.progress / h.duration) * 100;
      return pct < 95 && pct > 1;
    });
    const seen = new Set();
    const unique: any[] = [];
    for (const h of unfinished.sort((a, b) => b.watchedAt - a.watchedAt)) {
      const key = `${h.type}-${h.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(h);
    }
    return unique.slice(0, 5);
  }, [history]);

  const recentActivity = useMemo(() => history.slice(0, 4), [history]);

  const topGenres = useMemo(() => {
    const entries = Object.entries(stats.byGenre || {})
      .filter(([, count]) => (count as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    const total = entries.reduce((s, [, c]) => s + (c as number), 0);
    return entries.map(([name, count]) => ({
      name,
      count: count as number,
      pct: total ? Math.round(((count as number) / total) * 100) : 0,
    }));
  }, [stats]);

  // Watch heatmap data — last 12 weeks × 7 days
  const heatmap = useMemo(() => buildHeatmap(history), [history]);

  const visibleAchievements = useMemo(() => {
    const sorted = [...achievements].sort((a, b) => {
      if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
      return (b.progress || 0) - (a.progress || 0);
    });
    return showAllAch ? sorted : sorted.slice(0, 10);
  }, [achievements, showAllAch]);

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary ring-1 ring-primary/20">
              <LogIn size={40} />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Войдите в профиль</h1>
            <p className="text-foreground/55">
              Чтобы видеть свою статистику просмотра и собирать достижения, нужно войти в аккаунт.
            </p>
            <Link href="/" className="inline-block px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-semibold transition-colors">
              На главную
            </Link>
          </div>
        </main>
      </>
    );
  }

  const initial = (user.name || "?").charAt(0).toUpperCase();
  const hoursWatched = Math.floor(stats.totalHoursWatched);
  const featured = continueWatching[0];

  return (
    <>
      {/* Profile-scoped styles: cinematic effects, noise grain, animations.
          Embedded here (not globals.css) to keep them scoped + cacheable
          with the page. CSS vars share with existing primary color. */}
      <style jsx global>{`
        @keyframes shine-sweep {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes glow-pulse {
          0%, 100% { box-shadow: 0 0 28px rgba(163,230,53,0.18), 0 0 0 rgba(163,230,53,0.0); }
          50% { box-shadow: 0 0 56px rgba(163,230,53,0.32), 0 0 8px rgba(163,230,53,0.08); }
        }
        @keyframes legendary-border {
          0%, 100% { box-shadow: 0 0 18px rgba(250,204,21,0.25), inset 0 0 16px rgba(250,204,21,0.05); }
          50% { box-shadow: 0 0 36px rgba(250,204,21,0.5), inset 0 0 24px rgba(250,204,21,0.12); }
        }
        @keyframes tilt-hint {
          0%, 100% { transform: rotate(0deg) translateY(0); }
          50% { transform: rotate(0.5deg) translateY(-1px); }
        }
        @keyframes float-dot {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.5; }
          50% { transform: translateY(-12px) translateX(6px); opacity: 0.9; }
        }
        .kino-shine::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%);
          transform: translateX(-100%);
          pointer-events: none;
        }
        .kino-shine:hover::after { animation: shine-sweep 1.1s ease-out forwards; }
        .kino-glow-pulse { animation: glow-pulse 4s ease-in-out infinite; }
        .kino-legendary { animation: legendary-border 2.6s ease-in-out infinite; }
        /* SVG noise grain background — applied as a pseudo to give depth */
        .kino-noise::before {
          content: ""; position: absolute; inset: 0;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.2 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>");
          opacity: 0.35;
          mix-blend-mode: overlay;
          pointer-events: none;
        }
        .kino-card-tilt { transition: transform 350ms cubic-bezier(.2,.7,.2,1), box-shadow 350ms; }
        .kino-card-tilt:hover { transform: translateY(-2px) scale(1.005); }
      `}</style>

      <Navbar />
      <main className="relative min-h-screen bg-background pb-20 sm:pb-12 overflow-hidden">

        {/* ── Global noise grain over whole profile page ─────────────────── */}
        <div className="kino-noise absolute inset-0 pointer-events-none z-0" />

        {/* ── Floating particles (subtle, decorative) ────────────────────── */}
        <div className="absolute inset-0 pointer-events-none -z-0 overflow-hidden">
          {[...Array(6)].map((_, i) => (
            <span
              key={i}
              className="absolute w-1 h-1 rounded-full bg-primary/40"
              style={{
                top: `${15 + i * 13}%`,
                left: `${(i * 17 + 7) % 95}%`,
                animation: `float-dot ${5 + i}s ease-in-out infinite`,
                animationDelay: `${i * 0.6}s`,
                boxShadow: "0 0 8px rgba(163,230,53,0.6)",
              }}
            />
          ))}
        </div>

        {/* ── Hero: cinematic poster collage backdrop ─────────────────────── */}
        <section className="relative overflow-hidden">
          {/* Poster collage layer */}
          <div className="absolute inset-0 -z-10">
            {heroPosters.length > 0 && (
              <div className="grid grid-cols-6 sm:grid-cols-8 lg:grid-cols-12 gap-1 absolute inset-0 opacity-[0.18]">
                {heroPosters.map((p, i) => (
                  <div key={i} className="relative aspect-[2/3] overflow-hidden">
                    <Image
                      src={`${POSTER_BASE}/w185${p}`}
                      alt=""
                      fill
                      sizes="180px"
                      className="object-cover"
                    />
                  </div>
                ))}
              </div>
            )}
            {/* Heavy blur on top of posters for fog effect */}
            <div className="absolute inset-0 backdrop-blur-2xl bg-background/60" />
            {/* Lime green fog from top-right */}
            <div className="absolute -top-32 -right-20 w-[600px] h-[600px] rounded-full bg-primary/[0.18] blur-3xl" />
            {/* Purple fog from bottom-left for color depth */}
            <div className="absolute -bottom-32 -left-20 w-[500px] h-[500px] rounded-full bg-purple-500/[0.08] blur-3xl" />
            {/* Final gradient overlay — fade to bg at bottom */}
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/30 to-background" />
          </div>

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-8 sm:pb-12">
            <div className="flex justify-end mb-4">
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground/[0.04] backdrop-blur ring-1 ring-white/[0.08] text-foreground/75 hover:text-foreground hover:bg-foreground/[0.08] transition-colors text-[13px] font-medium"
              >
                <LogOut size={14} /> Выйти
              </button>
            </div>

            <div className="flex items-center gap-5 sm:gap-7 flex-wrap">
              {/* Avatar with multi-ring glow + premium badge */}
              <div className="relative flex-shrink-0">
                {/* Outer rotating glow */}
                <div className="absolute -inset-3 rounded-full opacity-60 kino-glow-pulse pointer-events-none" />
                <div
                  className="relative w-28 h-28 sm:w-36 sm:h-36 rounded-full bg-gradient-to-br from-background to-black ring-[3px] ring-primary/80 flex items-center justify-center text-5xl sm:text-7xl font-bold text-foreground"
                  style={{ boxShadow: "0 0 80px rgba(163,230,53,0.4), inset 0 0 40px rgba(163,230,53,0.08)" }}
                >
                  {initial}
                </div>
                <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-400/15 to-primary/20 ring-1 ring-primary/40 backdrop-blur text-primary text-[10.5px] font-bold tracking-wider uppercase">
                  <Crown size={11} /> Премиум
                </span>
              </div>

              <div className="flex-1 min-w-0">
                <h1 className="text-3xl sm:text-5xl font-black text-foreground tracking-tight leading-[1.02] drop-shadow-[0_2px_24px_rgba(0,0,0,0.6)]">
                  {user.name}
                </h1>
                <p className="text-foreground/55 mt-1.5 text-[13px] sm:text-sm">{user.email}</p>

                <div className="mt-5 max-w-md">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="inline-flex items-center gap-1.5 text-primary text-[13px] font-semibold">
                      <Trophy size={14} /> {unlockedCount} из {achievements.length} достижений
                    </div>
                    <span className="text-foreground/45 text-[11px] font-medium tabular-nums">{Math.round(progressPct)}%</span>
                  </div>
                  <div className="relative h-2 bg-white/[0.05] rounded-full overflow-hidden ring-1 ring-white/[0.04]">
                    <div
                      className="h-full bg-gradient-to-r from-primary/60 via-primary to-primary/80 rounded-full transition-all duration-1000 relative"
                      style={{ width: `${progressPct}%`, boxShadow: "0 0 12px rgba(163,230,53,0.6)" }}
                    >
                      {/* Animated shimmer on progress bar */}
                      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent" style={{ animation: "shine-sweep 3s linear infinite" }} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 z-10">

          {/* ── Hierarchy: featured continue watching (full width, biggest) ── */}
          {featured && (
            <FeaturedContinueHero item={featured} />
          )}

          {/* ── Stats row: 4 medium cards ───────────────────────────────── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <BigStat icon={<Film size={20} />} label="Фильмов" value={stats.totalMoviesWatched} />
            <BigStat icon={<Tv size={20} />} label="Сериалов" value={stats.totalTvEpisodes} />
            <BigStat icon={<Clock size={20} />} label="Часов просмотра" value={hoursWatched} />
            <BigStat icon={<Heart size={20} />} label="В избранном" value={stats.favoritesCount} />
          </section>

          {/* ── Tiny streak/extra stats: 4 smallest ─────────────────────── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            <SmallStat icon={<Flame size={13} />} label="Дней подряд" value={stats.consecutiveDays} accent />
            <SmallStat icon={<Flag size={13} />} label="Сериалов до конца" value={stats.completedTvSeries} />
            <SmallStat icon={<TrendingUp size={13} />} label="Серий за день (рекорд)" value={stats.maxEpisodesInOneDay} />
            <SmallStat icon={<AudioLines size={13} />} label="Озвучек попробовано" value={stats.uniqueTranslators} />
          </section>

          {/* ── Two-column row: more continue + activity ────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">

            <Card>
              <CardHeader title="Ещё в просмотре" link="/history" />
              {continueWatching.length <= 1 ? (
                <EmptyHint icon={<Play size={18} />} text="Когда у тебя будет несколько незаконченных — они появятся здесь" />
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {continueWatching.slice(1, 5).map(item => (
                    <MiniContinue key={`${item.type}-${item.id}`} item={item} />
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <CardHeader title="Недавняя активность" link="/history" />
              {recentActivity.length === 0 ? (
                <EmptyHint icon={<Clock size={18} />} text="Активность будет здесь, как только начнёшь смотреть" />
              ) : (
                <ul className="space-y-3">
                  {recentActivity.map((item, i) => (
                    <ActivityRow key={`${item.type}-${item.id}-${i}`} item={item} />
                  ))}
                </ul>
              )}
            </Card>
          </section>

          {/* ── Achievements + Genres ──────────────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4">

            <Card>
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center text-primary" style={{ boxShadow: "0 0 18px rgba(163,230,53,0.18)" }}>
                    <Award size={16} />
                  </div>
                  <h2 className="text-lg font-bold text-foreground">Достижения</h2>
                  <span className="text-foreground/45 text-[12px] font-medium">{unlockedCount} из {achievements.length}</span>
                </div>
                <button
                  onClick={() => setShowAllAch(!showAllAch)}
                  className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-foreground/[0.04] ring-1 ring-white/[0.08] text-foreground/75 hover:text-foreground hover:bg-foreground/[0.08] transition-colors text-[12px] font-medium"
                >
                  {showAllAch ? "Скрыть" : "Все достижения"} <ArrowRight size={12} />
                </button>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2.5">
                {visibleAchievements.map(a => (
                  <AchievementCard key={a.id} ach={a} unlockedDate={unlockDates[a.id]} />
                ))}
              </div>

              {!showAllAch && achievements.length > 10 && (
                <button
                  onClick={() => setShowAllAch(true)}
                  className="mt-4 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.06] text-foreground/55 hover:bg-foreground/[0.05] hover:text-foreground/80 transition-colors text-[12px] font-medium"
                >
                  Показать ещё {achievements.length - 10} достижений <ChevronDown size={13} />
                </button>
              )}
            </Card>

            {/* Right column: stacked donut + heatmap */}
            <div className="space-y-4">
              <Card>
                <CardHeader title="Любимые жанры" />
                {topGenres.length === 0 ? (
                  <EmptyHint icon={<Film size={18} />} text="Смотри фильмы — посчитаем твои жанры" />
                ) : (
                  <div className="flex items-center gap-4">
                    <DonutChart segments={topGenres} centerLabel={`${hoursWatched}ч`} />
                    <ul className="flex-1 space-y-1.5 min-w-0">
                      {topGenres.map((g, i) => (
                        <li key={g.name} className="flex items-center gap-2 text-[12.5px]">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }} />
                          <span className="text-foreground/55 tabular-nums text-[11.5px] w-8">{g.pct}%</span>
                          <span className="text-foreground/85 truncate">{g.name}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Card>

              <Card>
                <CardHeader title="Когда ты смотришь" />
                <WatchHeatmap data={heatmap} />
              </Card>
            </div>
          </section>

          {/* ── My lists ───────────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-4">Мои списки</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ListCard href="/favorites" title="Избранное" count={favorites.length} items={favorites.slice(0, 4)} />
              <ListCard href="/history" title="История" count={history.length} items={history.slice(0, 4)} />
              <ListCard href="/history?filter=hot" title="Лучшие за 2025" count={history.filter(h => h.vote_average >= 8).length} items={history.filter(h => h.vote_average >= 8).slice(0, 4)} />
              <ListCard href="/history?filter=top" title="Шедевры" count={history.filter(h => h.vote_average >= 9).length} items={history.filter(h => h.vote_average >= 9).slice(0, 4)} />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`relative rounded-2xl p-5 bg-foreground/[0.025] ring-1 ring-white/[0.05] backdrop-blur-sm kino-card-tilt hover:ring-white/[0.12] hover:bg-foreground/[0.04] ${className}`}>
      {children}
    </div>
  );
}

function CardHeader({ title, link }: { title: string; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      {link && (
        <Link href={link} className="inline-flex items-center gap-1 text-foreground/55 hover:text-primary text-[12px] font-medium transition-colors">
          Все <ArrowRight size={12} />
        </Link>
      )}
    </div>
  );
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-foreground/40">
      <div className="text-foreground/35">{icon}</div>
      <p className="text-[12.5px] text-center max-w-[260px]">{text}</p>
    </div>
  );
}

function BigStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="relative rounded-2xl p-4 sm:p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06] backdrop-blur-sm kino-card-tilt overflow-hidden hover:ring-primary/30 group">
      {/* Hover glow ring */}
      <div className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{ boxShadow: "inset 0 0 32px rgba(163,230,53,0.10)" }} />
      <div
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/12 ring-1 ring-primary/25 text-primary mb-3 transition-all duration-300 group-hover:scale-110"
        style={{ boxShadow: "0 0 16px rgba(163,230,53,0.18)" }}
      >
        {icon}
      </div>
      <div className="relative text-2xl sm:text-3xl font-bold text-foreground leading-none tabular-nums">{value}</div>
      <div className="relative text-foreground/55 text-[12px] mt-1.5">{label}</div>
    </div>
  );
}

function SmallStat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`relative rounded-xl px-3.5 py-2.5 ring-1 flex items-center gap-2.5 kino-card-tilt overflow-hidden ${
      accent ? "bg-gradient-to-br from-orange-500/[0.08] to-red-500/[0.04] ring-orange-400/20" : "bg-foreground/[0.025] ring-white/[0.05]"
    }`}>
      <div className={`flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0 ring-1 ${
        accent ? "bg-orange-400/15 text-orange-300 ring-orange-300/30" : "bg-primary/12 text-primary ring-primary/20"
      }`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-foreground text-[17px] font-bold leading-none tabular-nums">{value}</div>
        <div className="text-foreground/45 text-[10px] mt-0.5 truncate">{label}</div>
      </div>
    </div>
  );
}

/* ── Featured Continue Watching: full-width hero card with backdrop ── */
function FeaturedContinueHero({ item }: { item: any }) {
  const pct = item.duration ? Math.min(100, Math.floor((item.progress / item.duration) * 100)) : 0;
  const remaining = item.duration ? Math.max(0, Math.floor((item.duration - item.progress) / 60)) : 0;
  const href = item.type === "tv"
    ? `/tv/${item.id}${item.season ? `?s=${item.season}&e=${item.episode}` : ""}`
    : `/movie/${item.id}`;
  const backdrop = item.backdrop_path || item.poster_path;

  return (
    <section className="relative rounded-3xl overflow-hidden ring-1 ring-white/[0.06] kino-card-tilt group" style={{ boxShadow: "0 20px 60px -10px rgba(0,0,0,0.7), 0 0 0 1px rgba(163,230,53,0.05)" }}>
      {/* Backdrop image fills entire card */}
      {backdrop && (
        <div className="absolute inset-0">
          <Image
            src={`${POSTER_BASE}/w1280${backdrop}`}
            alt={item.title || ""}
            fill
            sizes="100vw"
            className="object-cover scale-105 transition-transform duration-[1500ms] group-hover:scale-110"
            priority
          />
          {/* Multi-layer gradient: depth on right, dark on left for text */}
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/75 to-black/20" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-transparent" />
          <div className="absolute -top-32 -right-12 w-[400px] h-[400px] rounded-full bg-primary/[0.10] blur-3xl" />
        </div>
      )}

      <div className="relative grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-6 p-6 sm:p-8 min-h-[280px] sm:min-h-[340px]">
        {/* Left: text + controls */}
        <div className="flex flex-col justify-end max-w-xl">
          <div className="inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full bg-primary/15 ring-1 ring-primary/30 backdrop-blur text-primary text-[10px] font-bold tracking-wider uppercase mb-3">
            <Sparkles size={10} /> Продолжить просмотр
          </div>

          <h2 className="text-3xl sm:text-5xl font-black text-white leading-[1.05] tracking-tight drop-shadow-[0_2px_20px_rgba(0,0,0,0.7)]">
            {item.title}
          </h2>

          {item.type === "tv" && item.season && item.episode && (
            <p className="text-white/70 text-[14px] mt-2 font-medium">
              Сезон {item.season} · Серия {item.episode}{item.episodeName ? ` — ${item.episodeName}` : ""}
            </p>
          )}

          {/* Custom progress bar with glow + percent label */}
          <div className="mt-6">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-white/65 text-[12px] font-semibold tabular-nums">{pct}%</span>
              {remaining > 0 && (
                <span className="text-white/55 text-[11.5px]">Осталось {remaining} мин</span>
              )}
            </div>
            <div className="relative h-1.5 bg-white/15 rounded-full overflow-hidden backdrop-blur-sm">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary/80 to-primary"
                style={{ width: `${pct}%`, boxShadow: "0 0 16px rgba(163,230,53,0.7)" }}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            <Link
              href={href}
              className="relative kino-shine overflow-hidden inline-flex items-center gap-2 h-12 px-6 rounded-full bg-primary text-primary-foreground font-bold text-[14px] hover:bg-primary/95 transition-all hover:scale-[1.02]"
              style={{ boxShadow: "0 8px 24px -6px rgba(163,230,53,0.5)" }}
            >
              <Play size={16} fill="currentColor" /> Продолжить
            </Link>
            <button className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/10 backdrop-blur ring-1 ring-white/15 text-white/85 hover:bg-white/15 hover:text-white transition-colors" aria-label="В избранное">
              <Bookmark size={16} />
            </button>
          </div>
        </div>

        {/* Right: poster card */}
        {item.poster_path && (
          <div className="hidden sm:block relative w-48 self-end rounded-2xl overflow-hidden ring-1 ring-white/15 transition-transform duration-500 group-hover:scale-105 group-hover:-rotate-1" style={{ boxShadow: "0 16px 40px -8px rgba(0,0,0,0.8)" }}>
            <div className="aspect-[2/3] relative">
              <Image
                src={`${POSTER_BASE}/w342${item.poster_path}`}
                alt=""
                fill
                sizes="200px"
                className="object-cover"
              />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MiniContinue({ item }: { item: any }) {
  const pct = item.duration ? Math.min(100, Math.floor((item.progress / item.duration) * 100)) : 0;
  const href = item.type === "tv"
    ? `/tv/${item.id}${item.season ? `?s=${item.season}&e=${item.episode}` : ""}`
    : `/movie/${item.id}`;
  return (
    <Link href={href} className="group block kino-card-tilt">
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/30 transition-all">
        {item.poster_path && (
          <Image
            src={`${POSTER_BASE}/w185${item.poster_path}`}
            alt={item.title || ""}
            fill
            sizes="160px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-transparent to-transparent" />
        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <div className="w-10 h-10 rounded-full bg-primary/95 flex items-center justify-center text-primary-foreground shadow-lg" style={{ boxShadow: "0 0 24px rgba(163,230,53,0.5)" }}>
            <Play size={16} fill="currentColor" />
          </div>
        </div>
        {/* Progress bar bottom */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/45">
          <div className="h-full bg-primary" style={{ width: `${pct}%`, boxShadow: "0 0 8px rgba(163,230,53,0.5)" }} />
        </div>
        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/65 backdrop-blur text-white text-[10px] font-bold ring-1 ring-white/10">
          {pct}%
        </span>
      </div>
      <p className="mt-1.5 text-foreground/85 text-[11.5px] font-medium line-clamp-1 group-hover:text-primary transition-colors">
        {item.title}
      </p>
    </Link>
  );
}

function ActivityRow({ item }: { item: any }) {
  const isTv = item.type === "tv";
  const href = isTv ? `/tv/${item.id}` : `/movie/${item.id}`;
  const pct = item.duration ? (item.progress / item.duration) * 100 : 0;

  let actionLabel: string;
  let actionIcon: React.ReactNode;
  let trailing: React.ReactNode = null;

  if (pct >= 95) {
    actionLabel = isTv ? "Посмотрел серию" : "Посмотрел фильм";
    actionIcon = <CheckCircle2 size={11} className="text-primary" />;
    if (item.vote_average) {
      trailing = (
        <span className="inline-flex items-center gap-0.5 text-amber-300 text-[11px] font-bold">
          {item.vote_average.toFixed(1)} <Star size={11} fill="currentColor" />
        </span>
      );
    }
  } else if (item.progress > 0) {
    actionLabel = "Смотрит";
    actionIcon = <Play size={10} className="text-primary" fill="currentColor" />;
  } else {
    actionLabel = "Добавил в избранное";
    actionIcon = <Bookmark size={10} className="text-primary" fill="currentColor" />;
  }

  return (
    <li className="flex items-start gap-3 group">
      <Link href={href} className="relative w-12 h-16 rounded-lg overflow-hidden bg-foreground/[0.05] ring-1 ring-white/[0.06] flex-shrink-0 group-hover:ring-primary/30 transition-all">
        {item.poster_path && (
          <Image
            src={`${POSTER_BASE}/w185${item.poster_path}`}
            alt={item.title || ""}
            fill
            sizes="48px"
            className="object-cover transition-transform duration-500 group-hover:scale-110"
          />
        )}
      </Link>
      <div className="flex-1 min-w-0">
        <div className="inline-flex items-center gap-1 text-foreground/55 text-[11.5px]">
          {actionIcon}
          <span>{actionLabel}</span>
        </div>
        <Link href={href} className="block text-foreground text-[13.5px] font-semibold mt-0.5 line-clamp-1 hover:text-primary transition-colors">
          {item.title}
          {isTv && item.season && item.episode && (
            <span className="text-foreground/45 font-normal text-[12px] ml-1.5">S{item.season}E{item.episode}</span>
          )}
        </Link>
        <p className="text-foreground/45 text-[11px] mt-0.5">{formatRelative(item.watchedAt)}</p>
      </div>
      {trailing && <div className="pt-0.5">{trailing}</div>}
    </li>
  );
}

const GENRE_COLORS = ["#a3e635", "#a78bfa", "#60a5fa", "#fb923c", "#f472b6"];

function DonutChart({ segments, centerLabel }: { segments: { name: string; pct: number }[]; centerLabel?: string }) {
  const R = 38;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="relative flex-shrink-0">
      <svg width="110" height="110" viewBox="0 0 100 100" className="-rotate-90">
        <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="11" />
        {segments.map((s, i) => {
          const dash = (s.pct / 100) * C;
          const arc = (
            <circle
              key={s.name}
              cx="50" cy="50" r={R}
              fill="none"
              stroke={GENRE_COLORS[i % GENRE_COLORS.length]}
              strokeWidth="11"
              strokeDasharray={`${dash} ${C - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap="round"
            />
          );
          offset += dash;
          return arc;
        })}
      </svg>
      {centerLabel && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-foreground text-[18px] font-bold leading-none">{centerLabel}</span>
          <span className="text-foreground/45 text-[9px] uppercase tracking-wider mt-0.5">всего</span>
        </div>
      )}
    </div>
  );
}

/* ── Watch heatmap: 12 weeks × 7 days, intensity by views/day ── */
function buildHeatmap(history: any[]): number[][] {
  const weeks = 12;
  const data: number[][] = Array.from({ length: weeks }, () => Array(7).fill(0));
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  for (const h of history) {
    const diffDays = Math.floor((todayStart.getTime() - new Date(h.watchedAt).setHours(0, 0, 0, 0)) / 86400_000);
    if (diffDays < 0 || diffDays >= weeks * 7) continue;
    const week = Math.floor(diffDays / 7);
    const day = diffDays % 7;
    data[weeks - 1 - week][day]++;
  }
  return data;
}

function WatchHeatmap({ data }: { data: number[][] }) {
  const max = Math.max(1, ...data.flat());
  const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col gap-[3px] py-[2px] text-foreground/35 text-[9px] font-medium">
        {dayLabels.map(d => <span key={d} className="h-[14px] leading-[14px]">{d}</span>)}
      </div>
      <div className="flex-1 grid grid-cols-12 gap-[3px]">
        {data.map((week, wi) => (
          <div key={wi} className="grid grid-rows-7 gap-[3px]">
            {week.map((count, di) => {
              const intensity = count === 0 ? 0 : Math.min(1, count / max);
              const opacity = count === 0 ? 0.05 : 0.15 + intensity * 0.75;
              return (
                <div
                  key={di}
                  className="w-full h-[14px] rounded-sm transition-all hover:scale-125"
                  style={{
                    backgroundColor: count === 0 ? "rgba(255,255,255,0.04)" : `rgba(163,230,53,${opacity})`,
                    boxShadow: intensity > 0.5 ? `0 0 6px rgba(163,230,53,${intensity * 0.4})` : undefined,
                  }}
                  title={count > 0 ? `${count} просмотр${count === 1 ? "" : count < 5 ? "а" : "ов"}` : "Нет просмотров"}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function ListCard({ href, title, count, items }: { href: string; title: string; count: number; items: any[] }) {
  const posters = items.filter(i => i.poster_path).slice(0, 4);
  return (
    <Link href={href} className="group block rounded-2xl overflow-hidden ring-1 ring-white/[0.06] bg-foreground/[0.025] hover:ring-primary/40 transition-all kino-card-tilt relative">
      <div className="relative aspect-[16/9] bg-foreground/[0.04]">
        {posters.length > 0 ? (
          <div className="grid grid-cols-2 grid-rows-2 h-full">
            {posters.map((p, i) => (
              <div key={i} className="relative overflow-hidden">
                <Image
                  src={`${POSTER_BASE}/w342${p.poster_path}`}
                  alt=""
                  fill
                  sizes="200px"
                  className="object-cover transition-transform duration-700 group-hover:scale-110"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/30">
            <Film size={32} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
        {/* Hover lime glow */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 bg-gradient-to-br from-primary/10 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-bold text-[15px] leading-tight">{title}</h3>
          <p className="text-white/65 text-[11.5px] mt-0.5">{count} {count === 1 ? "фильм" : count > 1 && count < 5 ? "фильма" : "фильмов"}</p>
        </div>
      </div>
    </Link>
  );
}

/* ── Achievement card with rarity tiering ─────────────────────────── */
function AchievementCard({ ach, unlockedDate }: { ach: UnlockedAchievement; unlockedDate?: string }) {
  const isUnlocked = ach.unlocked;
  const rarity = rarityFor(ach);

  // Rarity → visual tier (ring, glow, gradient, badge, AND icon color so
  // legendary icons glow amber, epic glow purple, etc. — replaces emoji
  // that all looked the same regardless of rarity).
  const tier = {
    common:    { ring: "ring-white/[0.06]",   glow: "",              grad: "from-foreground/[0.025] to-foreground/[0.01]", iconColor: "text-foreground/70",  iconBg: "bg-white/[0.06]",       text: "text-foreground/50",  badge: "bg-white/10 text-foreground/65" },
    rare:      { ring: "ring-blue-400/30",    glow: "",              grad: "from-blue-500/[0.10] to-blue-500/[0.02]",      iconColor: "text-blue-300",       iconBg: "bg-blue-500/[0.15]",    text: "text-blue-300",       badge: "bg-blue-400/15 text-blue-300" },
    epic:      { ring: "ring-purple-400/40",  glow: "[box-shadow:0_0_20px_rgba(168,85,247,0.20)]", grad: "from-purple-500/[0.12] to-purple-500/[0.02]",  iconColor: "text-purple-300",     iconBg: "bg-purple-500/[0.18]",  text: "text-purple-300",     badge: "bg-purple-400/15 text-purple-300" },
    legendary: { ring: "ring-amber-400/50",   glow: "kino-legendary", grad: "from-amber-500/[0.18] to-amber-400/[0.04]",   iconColor: "text-amber-300",      iconBg: "bg-amber-500/[0.20]",   text: "text-amber-300",      badge: "bg-amber-400/15 text-amber-300" },
  }[rarity];

  const rarityLabel = { common: "обычное", rare: "редкое", epic: "эпическое", legendary: "легендарное" }[rarity];

  return (
    <div
      className={`relative rounded-xl p-3 ring-1 group kino-card-tilt overflow-hidden ${
        isUnlocked
          ? `bg-gradient-to-br ${tier.grad} ${tier.ring} ${tier.glow}`
          : "bg-foreground/[0.02] ring-white/[0.04] hover:ring-white/15"
      }`}
      title={`${ach.desc} • ${rarityLabel}`}
    >
      {/* Shine sweep on hover */}
      {isUnlocked && <div className="kino-shine absolute inset-0" />}

      {!isUnlocked && (
        <div className="absolute top-1.5 right-1.5 text-foreground/30">
          <Lock size={10} />
        </div>
      )}

      {/* Rarity label top-right (only when unlocked) */}
      {isUnlocked && rarity !== "common" && (
        <span className={`absolute top-1.5 right-1.5 inline-flex items-center gap-0.5 px-1.5 py-px rounded text-[8px] font-bold uppercase tracking-wider ${tier.badge}`}>
          {rarity === "legendary" && <Zap size={8} fill="currentColor" />}
          {rarity}
        </span>
      )}

      <div className="relative flex justify-center mt-1">
        <div
          className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group-hover:scale-110 ring-1 ${
            isUnlocked ? `${tier.iconBg} ${tier.iconColor} ring-white/10` : "bg-white/[0.03] text-foreground/35 ring-white/[0.06]"
          }`}
          style={isUnlocked && rarity === "legendary" ? { boxShadow: "0 0 14px rgba(250,204,21,0.35)" } : undefined}
        >
          <AchievementIcon slug={ach.icon} size={22} />
        </div>
      </div>

      <div className="relative mt-1 text-center">
        <div className="text-foreground text-[11.5px] font-semibold leading-tight line-clamp-1">{ach.name}</div>
        <div className="text-foreground/45 text-[10px] mt-0.5 line-clamp-2 min-h-[2.2em]">{ach.desc}</div>
      </div>

      <div className="relative mt-2">
        {isUnlocked ? (
          <div className="flex items-center justify-between gap-1">
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold tracking-wide ${tier.badge}`}>Получено</span>
            {unlockedDate && (
              <span className="text-foreground/40 text-[9px] font-medium tabular-nums">
                {formatDate(unlockedDate)}
              </span>
            )}
          </div>
        ) : ach.progress > 0 ? (
          <div className="space-y-1">
            <div className="h-1 bg-white/[0.05] rounded-full overflow-hidden">
              <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.min(ach.progress * 100, 100)}%` }} />
            </div>
            <div className="text-[9px] text-foreground/45 text-center tabular-nums">{ach.current} / {ach.target}</div>
          </div>
        ) : (
          <div className="text-[9px] text-foreground/30 text-center">{ach.current} / {ach.target}</div>
        )}
      </div>
    </div>
  );
}
