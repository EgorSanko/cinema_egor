"use client";

import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getFavorites, getHistory } from "@/lib/storage";
import { computeStats, evaluateAchievements, type UnlockedAchievement } from "@/lib/achievements";
import { useEffect, useMemo, useState } from "react";
import {
  LogIn, LogOut, Heart, Clock, Award, Film, Tv, Trophy, Lock,
  Flame, Flag, TrendingUp, AudioLines, ArrowRight, Play, Bookmark,
  Star, CheckCircle2, ChevronDown, Crown,
} from "lucide-react";
import Link from "next/link";
import Image from "next/image";

const UNLOCK_DATES_KEY = "kino_achievement_dates";

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

const POSTER_BASE = "https://sapkeflykino.ru/tmdb-img";

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

  // Persist unlock dates for newly-unlocked achievements
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

  // Pick a backdrop from latest watch for the hero — gives the profile a
  // personal cinematic feel without requiring extra TMDB calls.
  const heroBackdrop = useMemo(() => {
    const withPoster = history.find((h: any) => h.backdrop_path || h.poster_path);
    if (!withPoster) return null;
    return `${POSTER_BASE}/w1280${withPoster.backdrop_path || withPoster.poster_path}`;
  }, [history]);

  // Continue-watching: items not finished, sorted by recent
  const continueWatching = useMemo(() => {
    const unfinished = history.filter((h: any) => {
      if (!h.duration || !h.progress) return false;
      const pct = (h.progress / h.duration) * 100;
      return pct < 95 && pct > 1;
    });
    // Dedupe by id (latest entry per title)
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

  // Recent activity timeline (last 4 distinct events)
  const recentActivity = useMemo(() => {
    return history.slice(0, 4);
  }, [history]);

  // Top genres for the donut chart
  const topGenres = useMemo(() => {
    const entries = Object.entries(stats.byGenre || {})
      .filter(([, count]) => (count as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    const total = entries.reduce((s, [, c]) => s + (c as number), 0);
    return entries.map(([name, count]) => ({ name, count: count as number, pct: total ? Math.round(((count as number) / total) * 100) : 0 }));
  }, [stats]);

  // Achievement display: closest-to-unlock first, then unlocked, then far-off
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

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20 sm:pb-12">
        {/* ── Hero header with backdrop ─────────────────────────────────── */}
        <section className="relative overflow-hidden">
          {heroBackdrop && (
            <div className="absolute inset-0 -z-10">
              <Image
                src={heroBackdrop}
                alt=""
                fill
                sizes="100vw"
                className="object-cover opacity-25"
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/85 to-background" />
              <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/60" />
            </div>
          )}
          <div className="absolute top-0 left-1/3 w-[600px] h-[400px] -z-10 rounded-full bg-primary/[0.08] blur-3xl" />

          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6 sm:pb-10">
            <div className="flex justify-end mb-2">
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-foreground/[0.04] backdrop-blur ring-1 ring-white/[0.08] text-foreground/75 hover:text-foreground hover:bg-foreground/[0.08] transition-colors text-[13px] font-medium"
              >
                <LogOut size={14} /> Выйти
              </button>
            </div>

            <div className="flex items-start gap-5 sm:gap-7 flex-wrap">
              {/* Avatar with glow + premium badge */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-28 h-28 sm:w-32 sm:h-32 rounded-full bg-gradient-to-br from-background/80 to-background ring-[3px] ring-primary/70 flex items-center justify-center text-5xl sm:text-6xl font-bold text-foreground"
                  style={{ boxShadow: "0 0 60px rgba(163,230,53,0.35), inset 0 0 30px rgba(163,230,53,0.06)" }}
                >
                  {initial}
                </div>
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-background ring-1 ring-primary/40 text-primary text-[10.5px] font-bold tracking-wide uppercase">
                  <Crown size={11} /> Премиум
                </span>
              </div>

              <div className="flex-1 min-w-0 pt-1">
                <h1 className="text-3xl sm:text-5xl font-black text-foreground tracking-tight leading-[1.02]">{user.name}</h1>
                <p className="text-foreground/55 mt-1.5 text-[13px] sm:text-sm">{user.email}</p>

                {/* Achievement progress bar */}
                <div className="mt-5 max-w-md">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="inline-flex items-center gap-1.5 text-primary text-[13px] font-semibold">
                      <Trophy size={14} /> {unlockedCount} из {achievements.length} достижений
                    </div>
                  </div>
                  <div className="h-2 bg-white/[0.05] rounded-full overflow-hidden ring-1 ring-white/[0.04]">
                    <div
                      className="h-full bg-gradient-to-r from-primary/70 to-primary rounded-full transition-all duration-700"
                      style={{ width: `${progressPct}%`, boxShadow: "0 0 12px rgba(163,230,53,0.4)" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">

          {/* ── Main stats (4 big cards) ─────────────────────────────────── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <BigStat icon={<Film size={20} />} label="Фильмов" value={stats.totalMoviesWatched} />
            <BigStat icon={<Tv size={20} />} label="Сериалов" value={stats.totalTvEpisodes} />
            <BigStat icon={<Clock size={20} />} label="Часов просмотра" value={hoursWatched} />
            <BigStat icon={<Heart size={20} />} label="В избранном" value={stats.favoritesCount} />
          </section>

          {/* ── Small stats (4 tiles) ────────────────────────────────────── */}
          <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SmallStat icon={<Flame size={14} />} label="Дней подряд" value={stats.consecutiveDays} />
            <SmallStat icon={<Flag size={14} />} label="Сериалов до конца" value={stats.completedTvSeries} />
            <SmallStat icon={<TrendingUp size={14} />} label="Серий за день (рекорд)" value={stats.maxEpisodesInOneDay} />
            <SmallStat icon={<AudioLines size={14} />} label="Озвучек попробовано" value={stats.uniqueTranslators} />
          </section>

          {/* ── Two-column: Continue Watching + Recent activity ──────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Continue watching */}
            <Card>
              <CardHeader title="Продолжить просмотр" link="/history" />
              {continueWatching.length === 0 ? (
                <EmptyHint icon={<Play size={18} />} text="Начни смотреть — здесь появятся фильмы с прогрессом" />
              ) : (
                <div className="space-y-4">
                  {/* Featured */}
                  <FeaturedContinue item={continueWatching[0]} />
                  {/* Mini row */}
                  {continueWatching.length > 1 && (
                    <div className="grid grid-cols-4 gap-2">
                      {continueWatching.slice(1, 5).map(item => (
                        <MiniContinue key={`${item.type}-${item.id}`} item={item} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>

            {/* Recent activity timeline */}
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

          {/* ── Two-column: Achievements + Genres ────────────────────────── */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.8fr_1fr] gap-4">

            {/* Achievements */}
            <Card>
              <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center text-primary">
                    <Award size={15} />
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

            {/* Genres */}
            <Card>
              <CardHeader title="Любимые жанры" />
              {topGenres.length === 0 ? (
                <EmptyHint icon={<Film size={18} />} text="Смотри фильмы — мы посчитаем твои любимые жанры" />
              ) : (
                <div className="flex items-center gap-5">
                  <DonutChart segments={topGenres} />
                  <ul className="flex-1 space-y-2 min-w-0">
                    {topGenres.map((g, i) => (
                      <li key={g.name} className="flex items-center gap-2.5 text-[13px]">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: GENRE_COLORS[i % GENRE_COLORS.length] }} />
                        <span className="text-foreground/55 tabular-nums text-[12px] w-9">{g.pct}%</span>
                        <span className="text-foreground/85 truncate">{g.name}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </section>

          {/* ── My lists ─────────────────────────────────────────────────── */}
          <section>
            <h2 className="text-lg font-bold text-foreground mb-4">Мои списки</h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <ListCard
                href="/favorites"
                title="Избранное"
                count={favorites.length}
                items={favorites.slice(0, 4)}
              />
              <ListCard
                href="/history"
                title="История"
                count={history.length}
                items={history.slice(0, 4)}
              />
              <ListCard
                href="/history?filter=hot"
                title="Лучшие за 2025"
                count={history.filter(h => h.vote_average >= 8).length}
                items={history.filter(h => h.vote_average >= 8).slice(0, 4)}
              />
              <ListCard
                href="/history?filter=top"
                title="Шедевры"
                count={history.filter(h => h.vote_average >= 9).length}
                items={history.filter(h => h.vote_average >= 9).slice(0, 4)}
              />
            </div>
          </section>
        </div>
      </main>
    </>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl p-5 bg-foreground/[0.025] ring-1 ring-white/[0.05] backdrop-blur-sm">
      {children}
    </div>
  );
}

function CardHeader({ title, link }: { title: string; link?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h2 className="text-lg font-bold text-foreground">{title}</h2>
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
    <div
      className="rounded-2xl p-4 sm:p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06] backdrop-blur-sm transition-all hover:ring-primary/25 hover:bg-foreground/[0.05] group"
    >
      <div
        className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-primary/12 ring-1 ring-primary/25 text-primary mb-3 transition-shadow group-hover:[box-shadow:0_0_18px_rgba(163,230,53,0.25)]"
      >
        {icon}
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-foreground leading-none tabular-nums">{value}</div>
      <div className="text-foreground/55 text-[12px] mt-1.5">{label}</div>
    </div>
  );
}

function SmallStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl px-4 py-3 bg-foreground/[0.025] ring-1 ring-white/[0.05] flex items-center gap-3">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary/12 text-primary ring-1 ring-primary/20 flex-shrink-0">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-foreground text-[18px] font-bold leading-none tabular-nums">{value}</div>
        <div className="text-foreground/45 text-[10.5px] mt-1 truncate">{label}</div>
      </div>
    </div>
  );
}

function FeaturedContinue({ item }: { item: any }) {
  const pct = item.duration ? Math.min(100, Math.floor((item.progress / item.duration) * 100)) : 0;
  const remaining = item.duration ? Math.max(0, Math.floor((item.duration - item.progress) / 60)) : 0;
  const href = item.type === "tv"
    ? `/tv/${item.id}${item.season ? `?s=${item.season}&e=${item.episode}` : ""}`
    : `/movie/${item.id}`;
  return (
    <div className="rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] flex flex-col sm:flex-row">
      <div className="relative sm:w-40 aspect-video sm:aspect-[2/3] flex-shrink-0 bg-black">
        {item.poster_path && (
          <Image
            src={`${POSTER_BASE}/w342${item.poster_path}`}
            alt={item.title || ""}
            fill
            sizes="160px"
            className="object-cover"
          />
        )}
      </div>
      <div className="flex-1 p-4 flex flex-col">
        <h3 className="text-foreground text-[16px] font-bold leading-tight">{item.title}</h3>
        {item.type === "tv" && item.season && item.episode ? (
          <p className="text-foreground/55 text-[12px] mt-1">{item.season} сезон, {item.episode} серия</p>
        ) : null}

        <div className="mt-3">
          <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          {remaining > 0 && (
            <p className="text-foreground/55 text-[11px] mt-1.5">Осталось {remaining} мин</p>
          )}
        </div>

        <div className="mt-auto pt-3 flex items-center gap-2">
          <Link
            href={href}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-semibold transition-colors"
          >
            <Play size={14} fill="currentColor" /> Продолжить просмотр
          </Link>
          <Link
            href="/favorites"
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-foreground/[0.05] hover:bg-foreground/[0.08] ring-1 ring-white/[0.08] text-foreground/65"
            aria-label="В избранное"
          >
            <Bookmark size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniContinue({ item }: { item: any }) {
  const pct = item.duration ? Math.min(100, Math.floor((item.progress / item.duration) * 100)) : 0;
  const href = item.type === "tv"
    ? `/tv/${item.id}${item.season ? `?s=${item.season}&e=${item.episode}` : ""}`
    : `/movie/${item.id}`;
  return (
    <Link href={href} className="group block">
      <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06]">
        {item.poster_path && (
          <Image
            src={`${POSTER_BASE}/w185${item.poster_path}`}
            alt={item.title || ""}
            fill
            sizes="120px"
            className="object-cover transition-transform group-hover:scale-105"
          />
        )}
        <span className="absolute bottom-1 left-1 right-1 text-center text-white text-[10px] font-bold bg-black/65 backdrop-blur rounded px-1 py-0.5">
          {pct}%
        </span>
      </div>
      <p className="mt-1.5 text-foreground/80 text-[11px] font-medium line-clamp-1 group-hover:text-foreground transition-colors">
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
    <li className="flex items-start gap-3">
      <Link href={href} className="relative w-12 h-16 rounded-lg overflow-hidden bg-foreground/[0.05] ring-1 ring-white/[0.06] flex-shrink-0">
        {item.poster_path && (
          <Image
            src={`${POSTER_BASE}/w185${item.poster_path}`}
            alt={item.title || ""}
            fill
            sizes="48px"
            className="object-cover"
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

function DonutChart({ segments }: { segments: { name: string; pct: number }[] }) {
  // SVG donut: cumulative pct → arcs
  const R = 36;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg width="100" height="100" viewBox="0 0 100 100" className="flex-shrink-0">
      <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="14" />
      {segments.map((s, i) => {
        const dash = (s.pct / 100) * C;
        const arc = (
          <circle
            key={s.name}
            cx="50"
            cy="50"
            r={R}
            fill="none"
            stroke={GENRE_COLORS[i % GENRE_COLORS.length]}
            strokeWidth="14"
            strokeDasharray={`${dash} ${C - dash}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 50 50)"
          />
        );
        offset += dash;
        return arc;
      })}
    </svg>
  );
}

function ListCard({ href, title, count, items }: { href: string; title: string; count: number; items: any[] }) {
  // Visual collage from up to 4 poster_paths
  const posters = items.filter(i => i.poster_path).slice(0, 4);
  return (
    <Link href={href} className="group block rounded-2xl overflow-hidden ring-1 ring-white/[0.06] bg-foreground/[0.025] hover:ring-primary/30 transition-all">
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
                  className="object-cover transition-transform group-hover:scale-105"
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-foreground/30">
            <Film size={32} />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent" />
        <div className="absolute bottom-3 left-3 right-3">
          <h3 className="text-white font-bold text-[15px] leading-tight">{title}</h3>
          <p className="text-white/65 text-[11.5px] mt-0.5">{count} {count === 1 ? "фильм" : count > 1 && count < 5 ? "фильма" : "фильмов"}</p>
        </div>
      </div>
    </Link>
  );
}

function AchievementCard({ ach, unlockedDate }: { ach: UnlockedAchievement; unlockedDate?: string }) {
  const isUnlocked = ach.unlocked;

  return (
    <div
      className={`relative rounded-xl p-3 transition-all duration-300 ring-1 group ${
        isUnlocked
          ? "bg-gradient-to-br from-primary/[0.14] to-primary/[0.03] ring-primary/30 hover:ring-primary/50"
          : "bg-foreground/[0.025] ring-white/[0.05] hover:ring-white/15"
      }`}
      style={isUnlocked ? { boxShadow: "0 0 16px rgba(163,230,53,0.10)" } : undefined}
      title={ach.desc}
    >
      {!isUnlocked && (
        <div className="absolute top-1.5 right-1.5 text-foreground/30">
          <Lock size={10} />
        </div>
      )}

      <div className="flex justify-center">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center text-2xl leading-none transition-transform group-hover:scale-105 ${
            isUnlocked ? "" : "grayscale opacity-50 group-hover:grayscale-0 group-hover:opacity-90"
          }`}
        >
          {ach.icon}
        </div>
      </div>

      <div className="mt-1 text-center">
        <div className="text-foreground text-[11.5px] font-semibold leading-tight line-clamp-1">{ach.name}</div>
        <div className="text-foreground/45 text-[10px] mt-0.5 line-clamp-2 min-h-[2.2em]">{ach.desc}</div>
      </div>

      <div className="mt-2">
        {isUnlocked ? (
          <div className="flex items-center justify-between gap-1">
            <span className="px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold tracking-wide">Получено</span>
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
