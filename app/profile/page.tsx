"use client";

import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getFavorites, getHistory, syncFromServer } from "@/lib/storage";
import { computeStats, evaluateAchievements, type UnlockedAchievement } from "@/lib/achievements";
import { getGenreLookup, pickPersona, GENRES } from "@/lib/genre-persona";
import { enrichHistoryWithGenres } from "@/lib/genre-enrich";
import { getCanon, setCanon, getCanonCandidates, type CanonPick } from "@/lib/canon";
import { getAllByStatus, type WatchStatus } from "@/lib/status";
import { getLists, createList, type UserList } from "@/lib/lists";
import { canFreezeNow, freezeDay, getFrozenDays, daysUntilNextFreeze } from "@/lib/streak-freeze";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LogIn, LogOut, Heart, Clock, Award, Film, Tv, Trophy, Lock,
  Flame, Flag, TrendingUp, AudioLines, ArrowRight, Play, Bookmark,
  Star, CheckCircle2, ChevronDown, Crown, Sparkles, Zap, Users,
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
    // Force a sync immediately so the server generates+returns a
    // friendCode for users who haven't synced yet (otherwise the
    // chip on profile stays empty).
    if (user?.email) {
      syncFromServer(user.email).catch(() => {});
    }
    return () => {
      window.removeEventListener("sync-complete", refresh);
      window.removeEventListener("favorites-changed", refresh);
    };
  }, [user?.email]);

  // genreLookup is a stable map — built once from the GENRES constant.
  // Without it computeStats can't populate stats.byGenre.
  const genreLookup = useMemo(() => getGenreLookup(), []);

  // Backfill: old history rows don't have genre_ids on them. Fetch each
  // unique (type, id) once from TMDB and cache to localStorage so byGenre
  // is populated even from legacy history. enrichedHistory == history
  // initially; gets replaced async after fetches complete.
  const [enrichedHistory, setEnrichedHistory] = useState<any[]>([]);
  useEffect(() => {
    let cancelled = false;
    setEnrichedHistory(history); // show stats immediately with what we have
    enrichHistoryWithGenres(history).then((enriched) => {
      if (!cancelled) setEnrichedHistory(enriched);
    });
    return () => { cancelled = true; };
  }, [history]);

  // Frozen days protect streak (Duolingo-style); refresh on freeze event
  const [frozenDays, setFrozenDays] = useState<string[]>([]);
  useEffect(() => {
    setFrozenDays(getFrozenDays());
    const onFreeze = () => setFrozenDays(getFrozenDays());
    window.addEventListener("streak-freeze-changed", onFreeze);
    return () => window.removeEventListener("streak-freeze-changed", onFreeze);
  }, []);
  const stats = useMemo(
    () => computeStats(enrichedHistory, favorites, genreLookup, frozenDays),
    [enrichedHistory, favorites, genreLookup, frozenDays]
  );

  // Canon: top 5 picks shown on profile
  const [canon, setCanonState] = useState<CanonPick[]>([]);
  useEffect(() => {
    setCanonState(getCanon());
    const onCanon = () => setCanonState(getCanon());
    window.addEventListener("canon-changed", onCanon);
    return () => window.removeEventListener("canon-changed", onCanon);
  }, []);
  const [canonPickerOpen, setCanonPickerOpen] = useState(false);
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
        /* Legendary now uses true gold (richer than amber) with a brighter
           outer glow + animated gradient border. Premium tier feel. */
        @keyframes legendary-border {
          0%, 100% { box-shadow: 0 0 20px rgba(250,204,21,0.30), 0 0 40px rgba(245,158,11,0.15), inset 0 0 18px rgba(250,204,21,0.06); }
          50% { box-shadow: 0 0 40px rgba(250,204,21,0.55), 0 0 80px rgba(245,158,11,0.25), inset 0 0 26px rgba(250,204,21,0.14); }
        }
        @keyframes float-dot {
          0%, 100% { transform: translateY(0) translateX(0); opacity: 0.5; }
          50% { transform: translateY(-12px) translateX(6px); opacity: 0.9; }
        }
        /* Fog blobs drift slowly + scale-breathe — barely perceptible movement
           that adds life without distracting from content. */
        @keyframes fog-drift-1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(40px, -20px) scale(1.08); }
        }
        @keyframes fog-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-30px, 20px) scale(1.12); }
        }
        @keyframes pulse-soft {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.06); opacity: 0.92; }
        }
        @keyframes progress-flow {
          0% { background-position: 0% 50%; }
          100% { background-position: 200% 50%; }
        }
        /* Subtle dashed border march for near-unlock locked achievements */
        @keyframes border-dance {
          to { background-position: 12px 0, -12px 0, 0 12px, 0 -12px; }
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
        .kino-fog-1 { animation: fog-drift-1 18s ease-in-out infinite; }
        .kino-fog-2 { animation: fog-drift-2 22s ease-in-out infinite; }
        .kino-pulse-soft { animation: pulse-soft 2.4s ease-in-out infinite; }
        /* Animated gradient flow on the featured progress bar */
        .kino-progress-flow {
          background: linear-gradient(90deg, #a3e635, #d9f99d, #a3e635, #d9f99d);
          background-size: 200% 100%;
          animation: progress-flow 3s linear infinite;
        }
        /* Vignette — radial dark overlay around the page edges */
        .kino-vignette {
          background: radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%);
        }
        /* Edge highlight at the top of each card (visible thin lit line) */
        .kino-edge::before {
          content: ""; position: absolute; inset: 0; border-radius: inherit;
          background: linear-gradient(180deg, rgba(255,255,255,0.06) 0%, transparent 12%, transparent 88%, rgba(0,0,0,0.18) 100%);
          pointer-events: none;
        }
        /* Near-unlock locked achievement: animated dashed border that
           slowly marches around to hint that you're close. */
        .kino-locked-near {
          background-image:
            linear-gradient(90deg, rgba(163,230,53,0.35) 50%, transparent 50%),
            linear-gradient(90deg, rgba(163,230,53,0.35) 50%, transparent 50%),
            linear-gradient(0deg,  rgba(163,230,53,0.35) 50%, transparent 50%),
            linear-gradient(0deg,  rgba(163,230,53,0.35) 50%, transparent 50%);
          background-size: 12px 1px, 12px 1px, 1px 12px, 1px 12px;
          background-position: 0 0, 0 100%, 0 0, 100% 0;
          background-repeat: repeat-x, repeat-x, repeat-y, repeat-y;
          animation: border-dance 1.5s linear infinite;
        }
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

        {/* ── Vignette: dark frame around viewport edges ───────────────── */}
        <div className="kino-vignette absolute inset-0 pointer-events-none z-[1]" />

        {/* ── Floating particles (varied size/speed for depth) ─────────── */}
        <div className="absolute inset-0 pointer-events-none -z-0 overflow-hidden">
          {[...Array(12)].map((_, i) => {
            const size = i % 3 === 0 ? 2 : 1; // mix of 1px and 2px dots
            return (
              <span
                key={i}
                className="absolute rounded-full bg-primary/40"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  top: `${8 + i * 7.5}%`,
                  left: `${(i * 13 + 11) % 95}%`,
                  animation: `float-dot ${4 + (i % 5)}s ease-in-out infinite`,
                  animationDelay: `${i * 0.4}s`,
                  boxShadow: `0 0 ${4 + size * 3}px rgba(163,230,53,0.6)`,
                }}
              />
            );
          })}
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
            {/* Drifting fog blobs — slow keyframe motion gives the bg "life" */}
            <div className="kino-fog-1 absolute -top-32 -right-20 w-[600px] h-[600px] rounded-full bg-primary/[0.18] blur-3xl" />
            <div className="kino-fog-2 absolute -bottom-32 -left-20 w-[500px] h-[500px] rounded-full bg-purple-500/[0.10] blur-3xl" />
            <div className="kino-fog-1 absolute top-20 left-1/3 w-[300px] h-[300px] rounded-full bg-cyan-500/[0.05] blur-3xl" style={{ animationDelay: "-9s" }} />
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
                <div className="flex items-center gap-3 flex-wrap mt-1.5">
                  <p className="text-foreground/55 text-[13px] sm:text-sm">{user.email}</p>
                  <FriendCodeChip />
                </div>

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

              {/* Mascot — справа от ника, только на десктопе чтоб не мешать на mobile */}
              <div className="hidden lg:flex flex-shrink-0 ml-auto items-end justify-end self-stretch">
                <video
                  src="/mascot.webm"
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="auto"
                  disablePictureInPicture
                  controlsList="nodownload noplaybackrate nofullscreen"
                  className="w-64 h-64 xl:w-80 xl:h-80 2xl:w-96 2xl:h-96 object-contain pointer-events-none select-none drop-shadow-[0_0_60px_rgba(163,230,53,0.3)]"
                  style={{ mixBlendMode: "screen" }}
                  aria-hidden="true"
                  tabIndex={-1}
                />
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
            <StreakStatWithFreeze value={stats.consecutiveDays} />
            <SmallStat icon={<Flag size={13} />} label="Сериалов до конца" value={stats.completedTvSeries} />
            <SmallStat icon={<TrendingUp size={13} />} label="Серий за день (рекорд)" value={stats.maxEpisodesInOneDay} />
            <SmallStat icon={<AudioLines size={13} />} label="Озвучек попробовано" value={stats.uniqueTranslators} />
          </section>

          {/* ── Top 5 personal canon — Letterboxd-style favourites ─────── */}
          <CanonStrip picks={canon} onEdit={() => setCanonPickerOpen(true)} />
          {canonPickerOpen && (
            <CanonPicker
              current={canon}
              onClose={() => setCanonPickerOpen(false)}
              onSave={(p) => { setCanon(p); setCanonPickerOpen(false); }}
            />
          )}

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
              <CinemaDNA topGenres={topGenres} />

              <Card>
                <MiniGenreStat
                  label="Ср. рейтинг"
                  value={(() => {
                    const rated = history.filter(h => h.vote_average > 0);
                    if (rated.length === 0) return "—";
                    const avg = rated.reduce((s, h) => s + h.vote_average, 0) / rated.length;
                    return avg.toFixed(1);
                  })()}
                  icon={<Star size={11} className="text-amber-300" fill="currentColor" />}
                />
              </Card>

              <Card>
                <CardHeader title="Когда ты смотришь" />
                <WatchHeatmap data={heatmap} />
                <LostTimePanel hours={hoursWatched} />
              </Card>
            </div>
          </section>

          {/* ── My lists ───────────────────────────────────────────────── */}
          <section>
            <StatusAndListsSection favorites={favorites} history={history} />
          </section>
        </div>
      </main>
    </>
  );
}

/* ── Status sections (Хочу / Смотрю / Просмотрел) + user lists ── */
function StatusAndListsSection({ favorites, history }: { favorites: any[]; history: any[] }) {
  const [want, setWant] = useState<any[]>([]);
  const [watching, setWatching] = useState<any[]>([]);
  const [watched, setWatched] = useState<any[]>([]);
  const [lists, setLists] = useState<UserList[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    const refresh = () => {
      setWant(getAllByStatus("want"));
      setWatching(getAllByStatus("watching"));
      setWatched(getAllByStatus("watched"));
      setLists(getLists());
    };
    refresh();
    window.addEventListener("status-changed", refresh);
    window.addEventListener("lists-changed", refresh);
    window.addEventListener("sync-complete", refresh);
    return () => {
      window.removeEventListener("status-changed", refresh);
      window.removeEventListener("lists-changed", refresh);
      window.removeEventListener("sync-complete", refresh);
    };
  }, []);

  const onCreate = () => {
    const name = newName.trim();
    if (!name) return;
    const l = createList(name);
    setNewName("");
    setCreating(false);
    location.href = `/list/${l.id}`;
  };

  return (
    <>
      <h2 className="text-lg font-bold text-foreground mb-4">Мои списки</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ListCard href="/favorites" title="Избранное" count={favorites.length} items={favorites.slice(0, 4)} />
        <ListCard href="/status/want" title="Хочу посмотреть" count={want.length} items={want.slice(0, 4)} />
        <ListCard href="/status/watching" title="Смотрю" count={watching.length} items={watching.slice(0, 4)} />
        <ListCard href="/status/watched" title="Просмотрел" count={watched.length} items={watched.slice(0, 4)} />
      </div>

      {/* User custom lists */}
      <div className="mt-8 flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-foreground">Мои подборки</h2>
        {!creating && (
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full bg-primary text-primary-foreground font-semibold text-[12px] hover:bg-primary/90">
            + Новая подборка
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-3 rounded-2xl p-3 bg-foreground/[0.03] ring-1 ring-white/[0.06] flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === "Enter" && onCreate()}
            placeholder="«Топ-10 нуаров»"
            className="flex-1 bg-background/40 ring-1 ring-white/[0.08] rounded-lg px-3 h-9 text-foreground text-[13px] outline-none focus:ring-primary/40"
          />
          <button onClick={onCreate} className="px-3 h-9 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold">Создать</button>
          <button onClick={() => { setCreating(false); setNewName(""); }} className="px-3 h-9 rounded-lg bg-foreground/[0.05] text-foreground/75 text-[12px]">Отмена</button>
        </div>
      )}

      {lists.length === 0 ? (
        <p className="text-foreground/45 text-[13px] py-4 text-center">Подборок пока нет — создай первую и добавляй фильмы через поиск</p>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {lists.map(l => (
            <ListCard key={l.id} href={`/list/${l.id}`} title={l.name} count={l.items.length} items={l.items.slice(0, 4)} />
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────── Sub-components ─────────────────────────── */

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`kino-edge relative rounded-2xl p-5 bg-gradient-to-b from-foreground/[0.035] to-foreground/[0.015] ring-1 ring-white/[0.05] backdrop-blur-sm kino-card-tilt hover:ring-white/[0.12] hover:bg-foreground/[0.04] ${className}`}
      style={{ boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.5)" }}
    >
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
          <div className="kino-fog-1 absolute -top-32 -right-12 w-[400px] h-[400px] rounded-full bg-primary/[0.12] blur-3xl" />
          {/* Cinematic grain over the backdrop */}
          <div className="kino-noise absolute inset-0" />
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
              {/* Flowing gradient on the filled portion — gives the bar life
                  even when paused (the user notices motion subliminally) */}
              <div
                className="kino-progress-flow absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${pct}%`, boxShadow: "0 0 18px rgba(163,230,53,0.7)" }}
              />
            </div>
          </div>

          {/* Buttons */}
          <div className="mt-5 flex items-center gap-2 flex-wrap">
            {/* Play button gets a soft pulse + shine sweep on hover — primary
                CTA needs to feel alive without being annoying */}
            <Link
              href={href}
              className="relative kino-shine kino-pulse-soft overflow-hidden inline-flex items-center gap-2 h-12 px-6 rounded-full bg-primary text-primary-foreground font-bold text-[14px] hover:bg-primary/95 transition-all hover:scale-[1.04]"
              style={{ boxShadow: "0 8px 28px -4px rgba(163,230,53,0.55), 0 0 24px rgba(163,230,53,0.3)" }}
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

function MiniGenreStat({ label, value, icon, small }: { label: string; value: string; icon?: React.ReactNode; small?: boolean }) {
  return (
    <div className="text-center">
      <div className="inline-flex items-center gap-1 mb-0.5">
        {icon}
        <span className={`text-foreground font-bold tabular-nums leading-none ${small ? "text-[13px]" : "text-[15px]"}`}>{value}</span>
      </div>
      <div className="text-foreground/40 text-[9.5px] uppercase tracking-wider mt-0.5">{label}</div>
    </div>
  );
}

/* ── CinemaDNA: personality + animated genre bars with emoji ── */
function CinemaDNA({ topGenres }: { topGenres: { name: string; count: number; pct: number }[] }) {
  const persona = pickPersona(topGenres);

  if (topGenres.length === 0) {
    return (
      <Card>
        <CardHeader title="Твоя киноДНК" />
        <EmptyHint
          icon={<span className="text-2xl">🎬</span>}
          text="Посмотри пару фильмов и сериалов — мы разберём из чего сделан твой вкус"
        />
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Твоя киноДНК" />

      {/* Persona verdict — big emoji + name + tagline */}
      <div className="relative -mx-2 mb-4 rounded-xl bg-gradient-to-br from-primary/[0.08] to-purple-500/[0.04] ring-1 ring-primary/15 px-4 py-3 overflow-hidden">
        <div className="absolute -top-6 -right-6 text-6xl opacity-10 pointer-events-none select-none">{persona.emoji}</div>
        <div className="relative flex items-center gap-3">
          <span className="text-3xl leading-none">{persona.emoji}</span>
          <div className="min-w-0">
            <div className="text-foreground font-bold text-[14px] leading-tight">{persona.title}</div>
            <div className="text-foreground/55 text-[11px] mt-0.5 leading-tight">{persona.tagline}</div>
          </div>
        </div>
      </div>

      {/* Animated genre bars */}
      <ul className="space-y-2">
        {topGenres.slice(0, 5).map((g, i) => {
          // Look up emoji for the genre by name (from GENRES table)
          const entry = Object.values(GENRES).find(x => x.name === g.name);
          return (
            <li key={g.name} className="flex items-center gap-2.5 group">
              <span className="text-base leading-none w-5 text-center" aria-hidden>
                {entry?.emoji ?? "🎬"}
              </span>
              <span className="text-foreground/85 text-[12px] font-medium w-[88px] truncate">{g.name}</span>
              <div className="relative flex-1 h-2 bg-white/[0.05] rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-1000 ease-out"
                  style={{
                    width: `${g.pct}%`,
                    background: `linear-gradient(90deg, ${GENRE_COLORS[i % GENRE_COLORS.length]} 0%, ${GENRE_COLORS[i % GENRE_COLORS.length]}aa 100%)`,
                    boxShadow: `0 0 8px ${GENRE_COLORS[i % GENRE_COLORS.length]}55`,
                    animationDelay: `${i * 120}ms`,
                  }}
                />
              </div>
              <span className="text-foreground/85 text-[11.5px] font-bold tabular-nums w-9 text-right">{g.pct}%</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

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

/* ── Friend code chip: shows user's code + copy button. Click opens
       a small modal with code, link, and input for friend's code. ── */
function FriendCodeChip() {
  const [code, setCode] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [friendInput, setFriendInput] = useState("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setCode(localStorage.getItem("kino_friend_code") || "");
    refresh();
    window.addEventListener("sync-complete", refresh);
    return () => window.removeEventListener("sync-complete", refresh);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  // Empty state — show generating button until sync settles
  if (!code) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/[0.05] ring-1 ring-white/[0.06] text-foreground/45 text-[11px] font-medium">
        <Users size={11} />
        Код генерируется…
      </span>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Твой код для сравнения вкусов с друзьями"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/15 ring-1 ring-purple-400/30 text-purple-200 text-[11px] font-bold tracking-wider uppercase hover:bg-purple-500/25 transition-colors"
      >
        <Users size={11} />
        Код: {code}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div onClick={e => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-background ring-1 ring-white/10 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-foreground font-bold text-lg flex items-center gap-2"><Users size={18} className="text-purple-300" /> Сравнить с другом</h2>
              <button onClick={() => setOpen(false)} className="w-8 h-8 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 flex items-center justify-center text-lg">×</button>
            </div>

            <div>
              <div className="text-foreground/55 text-[11px] uppercase tracking-wider font-semibold mb-2">Твой код — отправь другу</div>
              <button
                onClick={copy}
                className="w-full inline-flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-primary/15 ring-1 ring-purple-400/40 hover:ring-purple-300/60 transition-colors"
              >
                <span className="text-purple-100 font-black text-2xl tracking-[0.3em] tabular-nums">{code}</span>
                <span className="text-purple-200 text-[12px] font-semibold">{copied ? "✓ Скопировано" : "Копировать"}</span>
              </button>
              <p className="text-foreground/45 text-[11px] mt-2">Или ссылка: <span className="text-foreground/70">sapkeflykino.ru/compare/{code}</span></p>
            </div>

            <div>
              <div className="text-foreground/55 text-[11px] uppercase tracking-wider font-semibold mb-2">Ввести код друга</div>
              <div className="flex gap-2">
                <input
                  value={friendInput}
                  onChange={e => setFriendInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
                  maxLength={6}
                  placeholder="ABCD23"
                  className="flex-1 bg-background/40 ring-1 ring-white/[0.08] rounded-xl px-4 h-12 text-foreground text-center font-black text-xl tracking-[0.3em] tabular-nums outline-none focus:ring-purple-400/50"
                />
                <Link
                  href={friendInput.length === 6 ? `/compare/${friendInput}` : "#"}
                  onClick={e => { if (friendInput.length !== 6) e.preventDefault(); }}
                  className={`px-5 h-12 rounded-xl font-bold text-[13px] flex items-center transition-all ${friendInput.length === 6 ? "bg-primary text-primary-foreground hover:bg-primary/90" : "bg-foreground/[0.05] text-foreground/30 cursor-not-allowed"}`}
                >
                  Сравнить
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ── Streak stat with freeze button (Duolingo-style break protection) ── */
function StreakStatWithFreeze({ value }: { value: number }) {
  const [canFreeze, setCanFreeze] = useState(false);
  const [daysUntil, setDaysUntil] = useState(0);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    const refresh = () => {
      setCanFreeze(canFreezeNow());
      setDaysUntil(daysUntilNextFreeze());
    };
    refresh();
    window.addEventListener("streak-freeze-changed", refresh);
    return () => window.removeEventListener("streak-freeze-changed", refresh);
  }, []);

  const onFreeze = () => {
    if (confirming) {
      freezeDay();
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  return (
    <div className="relative rounded-xl px-3.5 py-2.5 bg-gradient-to-br from-orange-500/[0.08] to-red-500/[0.04] ring-1 ring-orange-400/20 flex items-center gap-3 kino-card-tilt overflow-hidden">
      <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-orange-400/15 text-orange-300 ring-1 ring-orange-300/30 flex-shrink-0">
        <Flame size={13} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-foreground text-[17px] font-bold leading-none tabular-nums">{value}</div>
        <div className="text-foreground/45 text-[10px] mt-0.5 truncate">Дней подряд</div>
      </div>
      <button
        onClick={onFreeze}
        disabled={!canFreeze}
        title={canFreeze ? "Заморозить вчерашний день — streak не сбросится" : `Доступно через ${daysUntil} дн.`}
        className={`flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg ring-1 transition-all ${
          canFreeze
            ? confirming
              ? "bg-cyan-400/30 ring-cyan-300/60 text-cyan-200 scale-110"
              : "bg-cyan-400/10 ring-cyan-400/30 text-cyan-300 hover:bg-cyan-400/20"
            : "bg-white/[0.02] ring-white/[0.04] text-foreground/20 cursor-not-allowed"
        }`}
      >
        {confirming ? <span className="text-[9px] font-bold">OK?</span> : <span style={{ fontSize: 12 }}>❄️</span>}
      </button>
    </div>
  );
}

/* ── Canon strip — 5 slots for personal favourites ── */
function CanonStrip({ picks, onEdit }: { picks: CanonPick[]; onEdit: () => void }) {
  const slots = [0, 1, 2, 3, 4];
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">⭐</span>
          <h2 className="text-lg font-bold text-foreground">Мой топ-5</h2>
        </div>
        <button
          onClick={onEdit}
          className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-foreground/[0.04] ring-1 ring-white/[0.08] text-foreground/75 hover:text-foreground hover:bg-foreground/[0.08] transition-colors text-[12px] font-medium"
        >
          {picks.length > 0 ? "Изменить" : "Выбрать"}
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2.5">
        {slots.map(i => {
          const p = picks[i];
          if (!p) {
            return (
              <button
                key={i}
                onClick={onEdit}
                className="aspect-[2/3] rounded-xl border-2 border-dashed border-white/[0.08] flex items-center justify-center text-foreground/30 hover:border-primary/40 hover:text-primary/60 transition-colors"
                aria-label={`Слот ${i + 1}`}
              >
                <span className="text-2xl font-light">+</span>
              </button>
            );
          }
          const href = p.type === "tv" ? `/tv/${p.id}` : `/movie/${p.id}`;
          return (
            <Link key={i} href={href} className="group relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] hover:ring-primary/40 transition-all kino-card-tilt">
              {p.poster_path ? (
                <Image
                  src={`${POSTER_BASE}/w342${p.poster_path}`}
                  alt={p.title}
                  fill
                  sizes="180px"
                  className="object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-foreground/30">
                  <Film size={28} />
                </div>
              )}
              <span className="absolute top-1.5 left-1.5 w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center ring-2 ring-background">
                {i + 1}
              </span>
              <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/95 to-transparent">
                <p className="text-white text-[11px] font-semibold line-clamp-2 leading-tight">{p.title}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/* ── Canon picker modal ── */
function CanonPicker({ current, onClose, onSave }: { current: CanonPick[]; onClose: () => void; onSave: (p: CanonPick[]) => void }) {
  const [selected, setSelected] = useState<CanonPick[]>(current);
  const candidates = useMemo(() => getCanonCandidates(), []);

  const toggle = (p: CanonPick) => {
    const key = `${p.type}-${p.id}`;
    const exists = selected.find(x => `${x.type}-${x.id}` === key);
    if (exists) setSelected(selected.filter(x => `${x.type}-${x.id}` !== key));
    else if (selected.length < 5) setSelected([...selected, p]);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-2xl max-h-[80vh] rounded-2xl bg-background ring-1 ring-white/10 flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-white/[0.06]">
          <div>
            <h2 className="text-foreground text-lg font-bold">Выбери свой топ-5</h2>
            <p className="text-foreground/55 text-[12px] mt-0.5">Из истории и избранного · {selected.length}/5</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 flex items-center justify-center">
            <span className="text-lg leading-none">×</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {candidates.length === 0 ? (
            <EmptyHint icon={<Film size={18} />} text="Сначала посмотри несколько фильмов или добавь в избранное" />
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
              {candidates.map(c => {
                const key = `${c.type}-${c.id}`;
                const idx = selected.findIndex(x => `${x.type}-${x.id}` === key);
                const isSelected = idx >= 0;
                const limitReached = !isSelected && selected.length >= 5;
                return (
                  <button
                    key={key}
                    onClick={() => toggle(c)}
                    disabled={limitReached}
                    className={`relative aspect-[2/3] rounded-xl overflow-hidden ring-1 transition-all ${
                      isSelected ? "ring-primary scale-95" : limitReached ? "ring-white/[0.04] opacity-40 cursor-not-allowed" : "ring-white/[0.08] hover:ring-white/30"
                    }`}
                  >
                    {c.poster_path ? (
                      <Image src={`${POSTER_BASE}/w185${c.poster_path}`} alt={c.title} fill sizes="120px" className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-foreground/[0.05] text-foreground/30">
                        <Film size={20} />
                      </div>
                    )}
                    {isSelected && (
                      <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-primary text-primary-foreground text-[12px] font-bold flex items-center justify-center ring-2 ring-background">
                        {idx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <div className="p-4 border-t border-white/[0.06] flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 h-10 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 text-[13px] font-medium">Отмена</button>
          <button onClick={() => onSave(selected)} className="px-5 h-10 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground text-[13px] font-bold">Сохранить</button>
        </div>
      </div>
    </div>
  );
}

/* ── Lost-time panel: what else you could have done in N hours ── */
function LostTimePanel({ hours }: { hours: number }) {
  if (hours < 5) return null; // No point for tiny counts
  // Each comparison: (label, divisor → "you could have...") — rotates so
  // refresh shows different fun fact each time. Seeded by hours so it's
  // stable per session but different across visits.
  const facts: { icon: string; text: string }[] = [
    { icon: "📚", text: `Прочитал бы ${Math.round(hours / 5.5)} книг(и) (по 350 стр.)` },
    { icon: "🏃", text: `Пробежал бы ${Math.round(hours * 9)} км (5 мин/км)` },
    { icon: "✈️", text: `${(hours / 12).toFixed(1)} перелётов Москва → Бали` },
    { icon: "☕", text: `Выпил бы ${Math.round(hours * 3)} чашек кофе` },
    { icon: "💤", text: `${Math.round(hours / 8)} ночей полноценного сна` },
    { icon: "🎸", text: `Научился бы основам гитары (~${Math.max(1, Math.round(hours / 30))} курс${hours > 60 ? "а" : ""})` },
    { icon: "🍕", text: `Приготовил бы ${Math.round(hours * 0.8)} пицц(ы) с нуля` },
    { icon: "🚗", text: `Из Москвы в Сочи ${Math.max(1, Math.round(hours / 20))} раз туда-обратно` },
    { icon: "🏊", text: `Проплыл бы ${Math.round(hours * 2)} км в бассейне` },
    { icon: "🌱", text: `Помидорный куст вырос бы ${Math.round(hours / 720)}+ раз` },
  ];
  // Pick 3 deterministic-looking but varied
  const start = Math.floor(hours) % facts.length;
  const picks = [0, 3, 6].map(o => facts[(start + o) % facts.length]);
  return (
    <div className="mt-4 pt-4 border-t border-white/[0.05]">
      <div className="text-foreground/55 text-[10.5px] uppercase tracking-wider font-semibold mb-2.5">
        За это время ты мог бы
      </div>
      <ul className="space-y-1.5">
        {picks.map((f, i) => (
          <li key={i} className="flex items-center gap-2.5 text-[11.5px]">
            <span className="text-base leading-none">{f.icon}</span>
            <span className="text-foreground/75">{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Watch heatmap: 12 weeks × 7 days, intensity by minutes/day ── */
type HeatCell = { count: number; minutes: number; date: Date };

function buildHeatmap(history: any[]): HeatCell[][] {
  const weeks = 12;
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  // Pre-fill each cell with its calendar date. Column wi=11 is the week
  // containing today (rightmost). Row di is "days into the week" so wi=11,
  // di=0 = today. wi=0, di=6 = 11*7+6 = 83 days ago.
  const data: HeatCell[][] = Array.from({ length: weeks }, (_, wi) =>
    Array.from({ length: 7 }, (_, di) => {
      const daysAgo = (weeks - 1 - wi) * 7 + di;
      const d = new Date(todayStart);
      d.setDate(d.getDate() - daysAgo);
      return { count: 0, minutes: 0, date: d };
    })
  );
  for (const h of history) {
    if (!h.progress || h.progress < 60) continue; // skip tap-ins
    const diffDays = Math.floor((todayStart.getTime() - new Date(h.watchedAt).setHours(0, 0, 0, 0)) / 86400_000);
    if (diffDays < 0 || diffDays >= weeks * 7) continue;
    const week = Math.floor(diffDays / 7);
    const day = diffDays % 7;
    const cell = data[weeks - 1 - week][day];
    cell.count += 1;
    // Count the lesser of progress and duration so a bogus duration=0 row
    // doesn't poison the heatmap. Cap at episode length for partial watches.
    const sec = h.duration > 0 ? Math.min(h.progress, h.duration) : h.progress;
    cell.minutes += sec / 60;
  }
  return data;
}

const RU_MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

function fmtDuration(mins: number): string {
  if (mins < 1) return "<1 мин";
  if (mins < 60) return `${Math.round(mins)} мин`;
  const h = Math.floor(mins / 60);
  const m = Math.round(mins - h * 60);
  return m === 0 ? `${h} ч` : `${h} ч ${m} мин`;
}

function WatchHeatmap({ data }: { data: HeatCell[][] }) {
  const flat = data.flat();
  const maxMin = Math.max(30, ...flat.map(c => c.minutes)); // floor at 30 so 1 episode lights up enough
  const dayLabels = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
  const [hover, setHover] = useState<{ x: number; y: number; cell: HeatCell } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef} className="relative flex gap-2.5">
      <div className="flex flex-col gap-[3px] py-[2px] text-foreground/35 text-[9px] font-medium">
        {dayLabels.map(d => <span key={d} className="h-[14px] leading-[14px]">{d}</span>)}
      </div>
      <div className="flex-1 grid grid-cols-12 gap-[3px]">
        {data.map((week, wi) => (
          <div key={wi} className="grid grid-rows-7 gap-[3px]">
            {week.map((cell, di) => {
              const intensity = cell.minutes === 0 ? 0 : Math.min(1, cell.minutes / maxMin);
              const opacity = cell.minutes === 0 ? 0.05 : 0.15 + intensity * 0.75;
              return (
                <div
                  key={di}
                  className="w-full h-[14px] rounded-sm transition-all hover:scale-125 cursor-pointer"
                  style={{
                    backgroundColor: cell.minutes === 0 ? "rgba(255,255,255,0.04)" : `rgba(163,230,53,${opacity})`,
                    boxShadow: intensity > 0.5 ? `0 0 6px rgba(163,230,53,${intensity * 0.4})` : undefined,
                  }}
                  onMouseEnter={(e) => {
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    const cellRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    if (!containerRect) return;
                    setHover({
                      x: cellRect.left - containerRect.left + cellRect.width / 2,
                      y: cellRect.top - containerRect.top,
                      cell,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                  onTouchStart={(e) => {
                    const containerRect = containerRef.current?.getBoundingClientRect();
                    const cellRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    if (!containerRect) return;
                    setHover({
                      x: cellRect.left - containerRect.left + cellRect.width / 2,
                      y: cellRect.top - containerRect.top,
                      cell,
                    });
                    setTimeout(() => setHover(null), 2500);
                  }}
                />
              );
            })}
          </div>
        ))}
      </div>
      {hover && (
        <div
          className="pointer-events-none absolute z-50 -translate-x-1/2 -translate-y-full mt-[-6px] px-2.5 py-1.5 rounded-lg bg-black/95 ring-1 ring-primary/30 text-foreground text-[11px] font-medium whitespace-nowrap shadow-lg"
          style={{ left: hover.x, top: hover.y, boxShadow: "0 6px 20px -4px rgba(0,0,0,0.6), 0 0 0 1px rgba(163,230,53,0.15)" }}
        >
          <div className="text-primary text-[10px] uppercase tracking-wider font-bold">
            {hover.cell.date.getDate()} {RU_MONTHS[hover.cell.date.getMonth()]}
          </div>
          {hover.cell.minutes > 0 ? (
            <div className="mt-0.5 text-foreground/85">
              <span className="text-foreground font-bold">{fmtDuration(hover.cell.minutes)}</span>
              <span className="text-foreground/55"> · {hover.cell.count} {hover.cell.count === 1 ? "запись" : hover.cell.count < 5 ? "записи" : "записей"}</span>
            </div>
          ) : (
            <div className="mt-0.5 text-foreground/55">ничего не смотрел</div>
          )}
        </div>
      )}
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
    legendary: { ring: "ring-yellow-300/60",  glow: "kino-legendary", grad: "from-yellow-400/[0.22] via-amber-500/[0.10] to-yellow-300/[0.05]", iconColor: "text-yellow-200", iconBg: "bg-gradient-to-br from-yellow-400/[0.35] to-amber-500/[0.15]", text: "text-yellow-200", badge: "bg-yellow-400/20 text-yellow-200" },
  }[rarity];

  const rarityLabel = { common: "обычное", rare: "редкое", epic: "эпическое", legendary: "легендарное" }[rarity];

  const nearUnlock = !isUnlocked && ach.progress >= 0.5;

  return (
    <div
      className={`relative rounded-xl p-3 ring-1 group kino-card-tilt overflow-hidden ${
        isUnlocked
          ? `bg-gradient-to-br ${tier.grad} ${tier.ring} ${tier.glow}`
          : nearUnlock
            ? "bg-gradient-to-br from-primary/[0.04] to-foreground/[0.01] ring-primary/15 hover:ring-primary/30"
            : "bg-foreground/[0.02] ring-white/[0.04] hover:ring-white/15"
      }`}
      title={`${ach.desc} • ${rarityLabel}`}
    >
      {/* Shine sweep on hover (only unlocked) */}
      {isUnlocked && <div className="kino-shine absolute inset-0" />}
      {/* Animated dashed border for near-unlock — gives the user a hint
          they're close without being obnoxious. Only fires at >=50%. */}
      {nearUnlock && <div className="kino-locked-near absolute inset-0 rounded-xl pointer-events-none" />}

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
