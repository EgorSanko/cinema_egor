"use client";

import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getFavorites, getHistory } from "@/lib/storage";
import { computeStats, evaluateAchievements, type UnlockedAchievement } from "@/lib/achievements";
import { useEffect, useMemo, useState } from "react";
import { LogIn, User, Heart, Clock, Award, Film, Tv, Trophy, Lock } from "lucide-react";
import Link from "next/link";

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const [history, setHistory] = useState(() => (typeof window !== "undefined" ? getHistory() : []));
  const [favorites, setFavorites] = useState(() => (typeof window !== "undefined" ? getFavorites() : []));

  useEffect(() => {
    setHistory(getHistory());
    setFavorites(getFavorites());
    const refresh = () => {
      setHistory(getHistory());
      setFavorites(getFavorites());
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

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 text-primary">
              <LogIn size={40} />
            </div>
            <h1 className="text-3xl font-bold text-foreground">Войдите в профиль</h1>
            <p className="text-muted-foreground">
              Чтобы видеть свою статистику просмотра и собирать достижения, нужно войти в аккаунт.
            </p>
            <Link href="/" className="inline-block px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors">
              На главную
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20 sm:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-12 space-y-10">

          {/* Profile header */}
          <section className="flex items-center gap-6 flex-wrap">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-primary/40 flex items-center justify-center text-4xl text-white shrink-0 ring-4 ring-primary/20">
              {(user.name || "?").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl font-bold text-foreground">{user.name}</h1>
              <p className="text-muted-foreground mt-1">{user.email}</p>
              <div className="mt-3 flex items-center gap-2 text-sm text-primary">
                <Trophy size={16} /> {unlockedCount} из {achievements.length} достижений
              </div>
            </div>
            <button onClick={logout} className="px-4 py-2 bg-card border border-border hover:border-red-500/50 hover:text-red-400 text-muted-foreground rounded-lg text-sm transition-colors">
              Выйти
            </button>
          </section>

          {/* Stats grid */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon={<Film size={24} />} label="Фильмов" value={stats.totalMoviesWatched} accent />
            <StatCard icon={<Tv size={24} />} label="Серий" value={stats.totalTvEpisodes} />
            <StatCard icon={<Clock size={24} />} label="Часов" value={Math.floor(stats.totalHoursWatched)} />
            <StatCard icon={<Heart size={24} />} label="В избранном" value={stats.favoritesCount} />
          </section>

          {/* Secondary stats row */}
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <SmallStat label="Дней подряд" value={stats.consecutiveDays} />
            <SmallStat label="Сериалов до конца" value={stats.completedTvSeries} />
            <SmallStat label="Серий за день (рекорд)" value={stats.maxEpisodesInOneDay} />
            <SmallStat label="Озвучек попробовано" value={stats.uniqueTranslators} />
          </section>

          {/* Achievements grid */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-3xl font-bold text-foreground flex items-center gap-2">
                <Award className="text-primary" /> Достижения
              </h2>
              <span className="text-muted-foreground text-sm">{unlockedCount}/{achievements.length}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {achievements.map(a => (
                <AchievementCard key={a.id} ach={a} />
              ))}
            </div>
          </section>

          {/* Quick links */}
          <section className="grid grid-cols-2 gap-3">
            <Link href="/favorites" className="flex items-center justify-center gap-2 px-6 py-4 bg-card border border-border rounded-xl hover:border-primary text-foreground transition-colors">
              <Heart size={18} className="text-red-400" /> Избранное
            </Link>
            <Link href="/history" className="flex items-center justify-center gap-2 px-6 py-4 bg-card border border-border rounded-xl hover:border-primary text-foreground transition-colors">
              <Clock size={18} className="text-primary" /> История
            </Link>
          </section>

        </div>
      </main>
    </>
  );
}

function StatCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`rounded-xl p-5 ${accent ? "bg-primary/10 border border-primary/30" : "bg-card border border-border"}`}>
      <div className={accent ? "text-primary" : "text-muted-foreground"}>{icon}</div>
      <div className="mt-2 text-3xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-card/50 border border-border rounded-lg px-3 py-2">
      <div className="text-foreground font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function AchievementCard({ ach }: { ach: UnlockedAchievement }) {
  const isUnlocked = ach.unlocked;
  return (
    <div
      className={`relative rounded-xl p-3 transition-all ${
        isUnlocked
          ? "bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/40"
          : "bg-card/30 border border-border opacity-60 grayscale hover:grayscale-0 hover:opacity-90"
      }`}
      title={ach.desc}
    >
      <div className="text-3xl mb-2 leading-none">{ach.icon}</div>
      <div className="text-foreground text-sm font-semibold leading-tight line-clamp-2">{ach.name}</div>
      <div className="text-muted-foreground text-[11px] mt-1 line-clamp-2">{ach.desc}</div>
      {!isUnlocked && (
        <div className="mt-2 space-y-1">
          <div className="h-1 bg-gray-800 rounded overflow-hidden">
            <div className="h-full bg-primary/60" style={{ width: `${ach.progress * 100}%` }} />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {ach.current}/{ach.target}
          </div>
        </div>
      )}
      {isUnlocked && (
        <div className="absolute top-2 right-2 text-primary">
          <Trophy size={14} />
        </div>
      )}
      {!isUnlocked && (
        <div className="absolute top-2 right-2 text-muted-foreground/40">
          <Lock size={12} />
        </div>
      )}
    </div>
  );
}
