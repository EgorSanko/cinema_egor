"use client";

import { useEffect, useMemo, useState, use } from "react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getHistory, getFavorites } from "@/lib/storage";
import { computeStats } from "@/lib/achievements";
import { getGenreLookup, GENRES } from "@/lib/genre-persona";
import { enrichHistoryWithGenres } from "@/lib/genre-enrich";
import Link from "next/link";
import Image from "next/image";
import { Users, ArrowLeft, Film } from "lucide-react";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

export default function ComparePage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { user } = useAuth();
  const [myHistory, setMyHistory] = useState<any[]>([]);
  const [myFavs, setMyFavs] = useState<any[]>([]);
  const [friendData, setFriendData] = useState<{ history: any[]; favorites: any[] } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const h = getHistory();
    setMyFavs(getFavorites());
    enrichHistoryWithGenres(h).then(setMyHistory);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "friend-lookup", code }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Не найдено");
        const enriched = await enrichHistoryWithGenres(data.data.history || []);
        setFriendData({ history: enriched, favorites: data.data.favorites || [] });
      } catch (e: any) {
        setError(e.message || "Не удалось загрузить");
      } finally { setLoading(false); }
    })();
  }, [code]);

  const genreLookup = useMemo(() => getGenreLookup(), []);
  const myStats = useMemo(() => computeStats(myHistory, myFavs, genreLookup), [myHistory, myFavs, genreLookup]);
  const friendStats = useMemo(
    () => friendData ? computeStats(friendData.history, friendData.favorites, genreLookup) : null,
    [friendData, genreLookup]
  );

  // Common watched titles (Jaccard-style)
  const { common, onlyMine, onlyFriend, matchPct } = useMemo(() => {
    if (!friendData) return { common: [], onlyMine: 0, onlyFriend: 0, matchPct: 0 };
    const mine = new Set(myHistory.map(h => `${h.type}-${h.id}`));
    const theirs = new Set(friendData.history.map(h => `${h.type}-${h.id}`));
    const commonKeys = [...mine].filter(k => theirs.has(k));
    const union = new Set([...mine, ...theirs]);
    const pct = union.size > 0 ? Math.round((commonKeys.length / union.size) * 100) : 0;

    // Build list of common items with poster
    const commonItems = commonKeys.slice(0, 12).map(k => {
      const h = myHistory.find(x => `${x.type}-${x.id}` === k);
      return h ? { id: h.id, type: h.type, title: h.title, poster_path: h.poster_path } : null;
    }).filter(Boolean) as any[];

    return {
      common: commonItems,
      onlyMine: mine.size - commonKeys.length,
      onlyFriend: theirs.size - commonKeys.length,
      matchPct: pct,
    };
  }, [myHistory, friendData]);

  // Top genres each
  const topGenresOf = (s: any) => {
    if (!s) return [] as { name: string; pct: number }[];
    const entries = Object.entries(s.byGenre || {})
      .filter(([, c]) => (c as number) > 0)
      .sort((a, b) => (b[1] as number) - (a[1] as number))
      .slice(0, 5);
    const total = entries.reduce((sum, [, c]) => sum + (c as number), 0);
    return entries.map(([n, c]) => ({ name: n, pct: total ? Math.round(((c as number) / total) * 100) : 0 }));
  };
  const myTop = useMemo(() => topGenresOf(myStats), [myStats]);
  const friendTop = useMemo(() => topGenresOf(friendStats), [friendStats]);

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4 text-center">
          <div>
            <span className="text-5xl">🤝</span>
            <h1 className="text-3xl font-bold text-foreground mt-4">Войдите чтобы сравнивать вкусы</h1>
            <Link href="/" className="inline-block mt-4 px-6 py-3 bg-primary text-primary-foreground rounded-xl">На главную</Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10 space-y-6">
          <Link href="/profile" className="inline-flex items-center gap-1.5 text-foreground/55 hover:text-primary text-[13px]">
            <ArrowLeft size={14} /> Профиль
          </Link>

          <header className="text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-500/15 ring-1 ring-purple-400/30 text-purple-300 text-[11px] font-bold uppercase tracking-widest mb-3">
              <Users size={11} /> Сравнение вкусов · {code}
            </div>
            <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tight">Ваши вкусы</h1>
          </header>

          {loading ? (
            <div className="text-center py-16 text-foreground/55">Загружаю…</div>
          ) : error ? (
            <div className="text-center py-16">
              <p className="text-foreground text-lg font-semibold">Не удалось найти</p>
              <p className="text-foreground/55 text-[13px] mt-2">{error}</p>
              <p className="text-foreground/45 text-[12px] mt-3">Проверь код у друга — 6 символов, без I/O/0/1</p>
            </div>
          ) : friendData ? (
            <>
              {/* Match % big */}
              <div className="relative rounded-3xl p-8 bg-gradient-to-br from-purple-500/[0.12] to-primary/[0.06] ring-1 ring-purple-400/20 text-center overflow-hidden">
                <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-purple-500/[0.18] blur-3xl pointer-events-none" />
                <div className="relative">
                  <div className="text-foreground/75 text-[12px] uppercase tracking-widest font-semibold">Совпадение вкусов</div>
                  <div className="text-[6rem] font-black leading-none mt-1 bg-gradient-to-r from-purple-300 to-primary bg-clip-text text-transparent tabular-nums" style={{ textShadow: "0 0 60px rgba(168,85,247,0.3)" }}>
                    {matchPct}%
                  </div>
                  <p className="text-foreground/65 text-sm mt-2">
                    {matchPct >= 70 ? "Кинематографичные близнецы 🎬" :
                     matchPct >= 40 ? "Много общего — есть о чём поспорить" :
                     matchPct >= 15 ? "Знакомы — но смотрите разное" :
                     "Совсем разные миры — это интересно"}
                  </p>
                </div>
              </div>

              {/* Counts */}
              <div className="grid grid-cols-3 gap-3">
                <CompareStat label="Только у тебя" value={onlyMine} accent="me" />
                <CompareStat label="Общих" value={common.length > 0 ? common.length + (Math.max(0, common.length - 12) > 0 ? `+` : "") as any : 0} accent="common" />
                <CompareStat label="Только у друга" value={onlyFriend} accent="them" />
              </div>

              {/* Common items */}
              {common.length > 0 && (
                <div className="rounded-2xl p-5 bg-foreground/[0.025] ring-1 ring-white/[0.06]">
                  <h2 className="text-foreground font-bold text-base mb-4">Вы оба смотрели</h2>
                  <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                    {common.map(c => (
                      <Link key={`${c.type}-${c.id}`} href={c.type === "tv" ? `/tv/${c.id}` : `/movie/${c.id}`} className="group block">
                        <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/40">
                          {c.poster_path ? (
                            <Image src={`${POSTER}/w185${c.poster_path}`} alt={c.title} fill sizes="120px" className="object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center text-foreground/30"><Film size={20} /></div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}

              {/* Genres side-by-side */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <GenreColumn title="Твои жанры" genres={myTop} color="#a3e635" />
                <GenreColumn title="Жанры друга" genres={friendTop} color="#a78bfa" />
              </div>
            </>
          ) : null}
        </div>
      </main>
    </>
  );
}

function CompareStat({ label, value, accent }: { label: string; value: number | string; accent: "me" | "common" | "them" }) {
  const styles = {
    me:     { bg: "from-primary/[0.10] to-primary/[0.02]",       ring: "ring-primary/25",       text: "text-primary" },
    common: { bg: "from-yellow-400/[0.12] to-amber-500/[0.04]",  ring: "ring-yellow-400/30",    text: "text-yellow-200" },
    them:   { bg: "from-purple-500/[0.10] to-purple-500/[0.02]", ring: "ring-purple-400/25",    text: "text-purple-300" },
  }[accent];
  return (
    <div className={`rounded-2xl p-4 bg-gradient-to-br ${styles.bg} ring-1 ${styles.ring} text-center`}>
      <div className={`text-3xl font-black tabular-nums ${styles.text}`}>{value}</div>
      <div className="text-foreground/75 text-[12px] mt-1">{label}</div>
    </div>
  );
}

function GenreColumn({ title, genres, color }: { title: string; genres: { name: string; pct: number }[]; color: string }) {
  return (
    <div className="rounded-2xl p-4 bg-foreground/[0.025] ring-1 ring-white/[0.06]">
      <h3 className="text-foreground font-bold text-[13px] mb-3">{title}</h3>
      {genres.length === 0 ? (
        <p className="text-foreground/40 text-[12px]">Нет данных</p>
      ) : (
        <ul className="space-y-2">
          {genres.map(g => {
            const entry = Object.values(GENRES).find(x => x.name === g.name);
            return (
              <li key={g.name} className="flex items-center gap-2">
                <span className="text-base w-5">{entry?.emoji ?? "🎬"}</span>
                <span className="text-foreground text-[12px] flex-1 truncate">{g.name}</span>
                <div className="flex-1 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${g.pct}%`, backgroundColor: color, boxShadow: `0 0 6px ${color}55` }} />
                </div>
                <span className="text-foreground/70 text-[11px] font-bold tabular-nums w-9 text-right">{g.pct}%</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
