"use client";

import { SwipeCards } from "@/components/swipe-cards";
import { GenrePicker } from "@/components/genre-picker";
import { getImageUrl } from "@/lib/tmdb";
import { Heart, Users, Trophy, Sparkles, ExternalLink, Clock, Film } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback } from "react";

interface RoomClientProps {
  code: string;
}

const GENRE_NAMES: Record<number, string> = {
  28: "\u042D\u043A\u0448\u043D", 12: "\u041F\u0440\u0438\u043A\u043B\u044E\u0447\u0435\u043D\u0438\u044F", 16: "\u0410\u043D\u0438\u043C\u0430\u0446\u0438\u044F", 35: "\u041A\u043E\u043C\u0435\u0434\u0438\u044F",
  80: "\u041A\u0440\u0438\u043C\u0438\u043D\u0430\u043B", 99: "\u0414\u043E\u043A\u0443\u043C\u0435\u043D\u0442\u0430\u043B\u044C\u043D\u044B\u0439", 18: "\u0414\u0440\u0430\u043C\u0430", 10751: "\u0421\u0435\u043C\u0435\u0439\u043D\u044B\u0439",
  14: "\u0424\u044D\u043D\u0442\u0435\u0437\u0438", 36: "\u0418\u0441\u0442\u043E\u0440\u0438\u0447\u0435\u0441\u043A\u0438\u0439", 27: "\u0423\u0436\u0430\u0441\u044B", 10402: "\u041C\u0443\u0437\u044B\u043A\u0430",
  9648: "\u0414\u0435\u0442\u0435\u043A\u0442\u0438\u0432", 10749: "\u041C\u0435\u043B\u043E\u0434\u0440\u0430\u043C\u0430", 878: "\u0424\u0430\u043D\u0442\u0430\u0441\u0442\u0438\u043A\u0430",
  53: "\u0422\u0440\u0438\u043B\u043B\u0435\u0440", 10752: "\u0412\u043E\u0435\u043D\u043D\u044B\u0439", 37: "\u0412\u0435\u0441\u0442\u0435\u0440\u043D",
};

interface RoomStatus {
  phase: string;
  bothJoined: boolean;
  allGenresDone: boolean;
  allDone: boolean;
  matches: any[];
  matchCount: number;
  compatibility: number;
  genreCompatibility: number;
  sharedGenres: number[];
  players: Record<string, { name: string; genres: number[]; genresDone: boolean; liked: number; total: number; done: boolean }>;
  totalMovies: number;
  recommendations: any[];
}

export function RoomClient({ code }: RoomClientProps) {
  const [playerName, setPlayerName] = useState("");
  const [phase, setPhase] = useState<"loading" | "genres" | "waiting-genres" | "swiping" | "waiting" | "results">("loading");
  const [status, setStatus] = useState<RoomStatus | null>(null);
  const [movies, setMovies] = useState<any[]>([]);
  const [genreLoading, setGenreLoading] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("swipe_player");
    if (saved) { setPlayerName(saved); checkStatus(saved); }
  }, []);

  const checkStatus = async (name?: string) => {
    try {
      const res = await fetch("/api/swipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", code }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data);
        const pName = name || playerName;
        const player = data.players[pName];
        if (data.phase === "results" || data.allDone) setPhase("results");
        else if (data.phase === "swiping") {
          if (player?.done) setPhase("waiting");
          else { await loadDeck(); setPhase("swiping"); }
        } else if (data.phase === "genres") {
          setPhase(player?.genresDone ? "waiting-genres" : "genres");
        }
      }
    } catch {}
  };

  const loadDeck = async () => {
    try {
      const res = await fetch("/api/swipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deck", code }),
      });
      const data = await res.json();
      if (data.success && data.movies) setMovies(data.movies);
    } catch {}
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/swipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "status", code }),
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data);
        if (data.allDone || data.phase === "results") setPhase("results");
        else if (data.phase === "swiping" && phase === "waiting-genres") {
          await loadDeck(); setPhase("swiping");
        }
      }
    } catch {}
  }, [code, phase]);

  useEffect(() => {
    if (phase !== "waiting" && phase !== "waiting-genres") return;
    const interval = setInterval(fetchStatus, 3000);
    fetchStatus();
    return () => clearInterval(interval);
  }, [phase, fetchStatus]);

  const handleGenresSubmit = async (genres: number[]) => {
    setGenreLoading(true);
    try {
      const res = await fetch("/api/swipe", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "genres", code, playerName, genres }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.phase === "swiping") { await loadDeck(); setPhase("swiping"); }
        else setPhase("waiting-genres");
      }
    } catch {} finally { setGenreLoading(false); }
  };

  const handleSwipeComplete = () => { setPhase("waiting"); fetchStatus(); };

  if (phase === "loading") {
    return <main className="bg-background min-h-screen flex items-center justify-center">
      <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
    </main>;
  }

  if (phase === "genres") {
    return <main className="bg-background min-h-screen pb-24 sm:pb-8">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="text-center mb-4">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full text-sm">
            <Users size={14} className="text-primary" />
            <span className="font-mono font-bold text-foreground tracking-wider">{code}</span>
          </span>
        </div>
        <GenrePicker playerName={playerName} onSubmit={handleGenresSubmit} loading={genreLoading} />
      </div>
    </main>;
  }

  if (phase === "waiting-genres") {
    const players = status?.players || {};
    return <main className="bg-background min-h-screen pb-24 sm:pb-8">
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-8">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Clock size={32} className="text-primary animate-pulse" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{"\u0412\u0430\u0448\u0438 \u0436\u0430\u043D\u0440\u044B \u0441\u043E\u0445\u0440\u0430\u043D\u0435\u043D\u044B!"}</h2>
          <p className="text-muted-foreground">{"\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0430..."}</p>
        </div>
        <div className="space-y-3">
          {Object.keys(players).map(key => (
            <div key={key} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${players[key].genresDone ? "bg-green-500" : "bg-primary/50"}`}>
                  {players[key].name.charAt(0).toUpperCase()}
                </div>
                <p className="text-foreground font-medium">{players[key].name}</p>
              </div>
              <span className={`text-sm font-medium px-3 py-1 rounded-lg ${players[key].genresDone ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                {players[key].genresDone ? "\u2713 \u0413\u043E\u0442\u043E\u0432\u043E" : "\u0412\u044B\u0431\u0438\u0440\u0430\u0435\u0442..."}
              </span>
            </div>
          ))}
        </div>
        {Object.keys(players).length < 2 && (
          <div className="p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <p className="text-yellow-400 text-sm">
              {"\u041F\u0430\u0440\u0442\u043D\u0451\u0440 \u0435\u0449\u0451 \u043D\u0435 \u043F\u043E\u0434\u043A\u043B\u044E\u0447\u0438\u043B\u0441\u044F. \u041A\u043E\u0434: "}<strong className="font-mono tracking-wider">{code}</strong>
            </p>
          </div>
        )}
      </div>
    </main>;
  }

  if (phase === "swiping") {
    return <main className="bg-background min-h-screen pb-24 sm:pb-8">
      <div className="max-w-lg mx-auto px-4 py-6">
        <div className="text-center mb-4">
          <span className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-full text-sm">
            <Users size={14} className="text-primary" />
            <span className="font-mono font-bold text-foreground tracking-wider">{code}</span>
          </span>
        </div>
        {movies.length > 0 ? (
          <SwipeCards movies={movies} roomCode={code} playerName={playerName} onComplete={handleSwipeComplete} />
        ) : (
          <div className="text-center py-20 text-muted-foreground">{"\u0417\u0430\u0433\u0440\u0443\u0437\u043A\u0430 \u0444\u0438\u043B\u044C\u043C\u043E\u0432..."}</div>
        )}
      </div>
    </main>;
  }

  if (phase === "waiting") {
    const players = status?.players || {};
    return <main className="bg-background min-h-screen pb-24 sm:pb-8">
      <div className="max-w-md mx-auto px-4 py-12 text-center space-y-8">
        <div className="w-20 h-20 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-foreground mb-2">{"\u0412\u044B \u0437\u0430\u043A\u043E\u043D\u0447\u0438\u043B\u0438! \uD83D\uDC4F"}</h2>
          <p className="text-muted-foreground">{"\u041E\u0436\u0438\u0434\u0430\u043D\u0438\u0435 \u043F\u0430\u0440\u0442\u043D\u0451\u0440\u0430..."}</p>
        </div>
        <div className="space-y-3">
          {Object.keys(players).map(key => (
            <div key={key} className="flex items-center justify-between p-4 bg-card border border-border rounded-xl">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${players[key].done ? "bg-green-500" : "bg-primary/50"}`}>
                  {players[key].name.charAt(0).toUpperCase()}
                </div>
                <div className="text-left">
                  <p className="text-foreground font-medium">{players[key].name}</p>
                  <p className="text-muted-foreground text-xs">{"\u2764\uFE0F"} {players[key].liked} {"\u0438\u0437"} {players[key].total}</p>
                </div>
              </div>
              <span className={`text-sm font-medium px-3 py-1 rounded-lg ${players[key].done ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"}`}>
                {players[key].done ? "\u2713 \u0413\u043E\u0442\u043E\u0432\u043E" : "\u0421\u0432\u0430\u0439\u043F\u0430\u0435\u0442..."}
              </span>
            </div>
          ))}
        </div>
      </div>
    </main>;
  }

  // RESULTS
  const matches = status?.matches || [];
  const compatibility = status?.compatibility || 0;
  const genreCompat = status?.genreCompatibility || 0;
  const sharedGenres = (status?.sharedGenres || []).map((id: number) => GENRE_NAMES[id]).filter(Boolean);
  const players = status?.players || {};
  const playerKeys = Object.keys(players);
  const recommendations = status?.recommendations || [];

  const compatEmoji = compatibility >= 80 ? "\uD83D\uDD25" : compatibility >= 60 ? "\uD83D\uDC95" : compatibility >= 40 ? "\uD83D\uDE0A" : compatibility >= 20 ? "\uD83E\uDD14" : "\uD83D\uDE05";
  const compatText = compatibility >= 80 ? "\u0418\u0434\u0435\u0430\u043B\u044C\u043D\u0430\u044F \u043F\u0430\u0440\u0430!" : compatibility >= 60 ? "\u041E\u0442\u043B\u0438\u0447\u043D\u0430\u044F \u0441\u043E\u0432\u043C\u0435\u0441\u0442\u0438\u043C\u043E\u0441\u0442\u044C!" : compatibility >= 40 ? "\u041D\u0435\u043F\u043B\u043E\u0445\u043E!" : compatibility >= 20 ? "\u0415\u0441\u0442\u044C \u043D\u0430\u0434 \u0447\u0435\u043C \u043F\u043E\u0440\u0430\u0431\u043E\u0442\u0430\u0442\u044C" : "\u0420\u0430\u0437\u043D\u044B\u0435 \u0432\u043A\u0443\u0441\u044B!";

  return (
    <main className="bg-background min-h-screen pb-24 sm:pb-8">
      <div className="max-w-lg mx-auto px-4 py-8 space-y-8">

        {/* Compatibility meter */}
        <div className="text-center space-y-4">
          <div className="relative w-36 h-36 mx-auto">
            <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="8" className="text-card" />
              <circle cx="60" cy="60" r="52" fill="none" strokeWidth="8"
                strokeDasharray={`${compatibility * 3.27} ${327 - compatibility * 3.27}`} strokeLinecap="round"
                className={`${compatibility >= 60 ? "text-green-500" : compatibility >= 40 ? "text-yellow-500" : "text-red-400"} transition-all duration-1000`} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-black text-foreground">{compatibility}%</span>
              <span className="text-xs text-muted-foreground">{"\u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435"}</span>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground">{compatEmoji} {compatText}</h1>
        </div>

        {/* Genre compatibility */}
        <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
          <h3 className="text-foreground font-semibold flex items-center gap-2">{"\uD83C\uDFAD \u0416\u0430\u043D\u0440\u044B"}</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{"\u0421\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0435 \u0436\u0430\u043D\u0440\u043E\u0432:"}</span>
            <span className="text-sm font-bold text-foreground">{genreCompat}%</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-primary to-pink-500 rounded-full transition-all duration-1000" style={{ width: `${genreCompat}%` }} />
          </div>
          {sharedGenres.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-2">{"\u041E\u0431\u0449\u0438\u0435 \u0436\u0430\u043D\u0440\u044B:"}</p>
              <div className="flex flex-wrap gap-1.5">
                {sharedGenres.map((g: string) => <span key={g} className="text-xs bg-primary/10 text-primary px-2.5 py-1 rounded-lg">{g}</span>)}
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border mt-3">
            {playerKeys.map(key => (
              <div key={key}>
                <p className="text-xs text-muted-foreground mb-1.5">{players[key].name}:</p>
                <div className="flex flex-wrap gap-1">
                  {(players[key].genres || []).map((gId: number) => (
                    <span key={gId} className={`text-[10px] px-1.5 py-0.5 rounded ${(status?.sharedGenres || []).includes(gId) ? "bg-green-500/10 text-green-400" : "bg-card text-muted-foreground border border-border"}`}>
                      {GENRE_NAMES[gId] || gId}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Player stats */}
        <div className="grid grid-cols-2 gap-3">
          {playerKeys.map(key => (
            <div key={key} className="p-4 bg-card border border-border rounded-xl text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg mb-2">
                {players[key].name.charAt(0).toUpperCase()}
              </div>
              <p className="text-foreground font-medium text-sm">{players[key].name}</p>
              <p className="text-muted-foreground text-xs mt-1">{"\u2764\uFE0F"} {players[key].liked} {"\u0438\u0437"} {players[key].total}</p>
            </div>
          ))}
        </div>

        {/* Matches */}
        <div className="space-y-4">
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Sparkles size={22} className="text-yellow-400" />
            {matches.length > 0
              ? `${matches.length} \u043C\u044D\u0442\u0447${matches.length === 1 ? "" : matches.length < 5 ? "\u0430" : "\u0435\u0439"}!`
              : "\u041D\u0435\u0442 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0439"}
          </h2>
          {matches.length === 0 ? (
            <div className="text-center py-8 bg-card border border-border rounded-2xl">
              <Heart size={40} className="mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-muted-foreground">{"\u041D\u0438 \u043E\u0434\u0438\u043D \u0444\u0438\u043B\u044C\u043C \u043D\u0435 \u0441\u043E\u0432\u043F\u0430\u043B"}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {matches.map((match: any, idx: number) => {
                const href = match.type === "tv" ? `/tv/${match.id}` : `/movie/${match.id}`;
                return (
                  <Link key={`${match.type}-${match.id}`} href={href}>
                    <div className="flex items-center gap-4 p-4 bg-card border border-border rounded-2xl hover:border-primary/50 transition-all group">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                        idx === 0 ? "bg-yellow-500/20 text-yellow-400" : idx === 1 ? "bg-gray-300/20 text-gray-300" : idx === 2 ? "bg-amber-600/20 text-amber-500" : "bg-card text-muted-foreground border border-border"
                      }`}>{idx === 0 ? "\uD83D\uDC51" : idx + 1}</div>
                      <div className="relative w-14 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-muted">
                        <Image src={getImageUrl(match.poster_path, "w92") || "/placeholder.svg"} alt={match.title} fill className="object-cover" sizes="56px" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-foreground font-semibold line-clamp-1 group-hover:text-primary transition-colors">{match.title}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">{"\u2B50"} {match.vote_average?.toFixed(1)}</span>
                          {match.release_date && <span className="text-xs text-muted-foreground">{new Date(match.release_date).getFullYear()}</span>}
                          {match.type === "tv" && <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">{"\u0421\u0435\u0440\u0438\u0430\u043B"}</span>}
                        </div>
                      </div>
                      <ExternalLink size={16} className="text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>

        {/* RECOMMENDATIONS */}
        {recommendations.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
              <Film size={22} className="text-primary" />
              {"\u0412\u0430\u043C \u0442\u0430\u043A\u0436\u0435 \u043F\u043E\u043D\u0440\u0430\u0432\u0438\u0442\u0441\u044F"}
            </h2>
            <p className="text-muted-foreground text-sm">{"\u041F\u043E\u0434\u043E\u0431\u0440\u0430\u043D\u043E \u043D\u0430 \u043E\u0441\u043D\u043E\u0432\u0435 \u0432\u0430\u0448\u0438\u0445 \u0441\u043E\u0432\u043F\u0430\u0434\u0435\u043D\u0438\u0439"}</p>
            <div className="grid grid-cols-3 gap-3">
              {recommendations.map((rec: any) => {
                const href = rec.type === "tv" ? `/tv/${rec.id}` : `/movie/${rec.id}`;
                return (
                  <Link key={`${rec.type}-${rec.id}`} href={href} className="group">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-muted">
                      <Image src={getImageUrl(rec.poster_path, "w342") || "/placeholder.svg"} alt={rec.title} fill className="object-cover group-hover:scale-105 transition-transform duration-300" sizes="150px" />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-8">
                        <span className="text-white text-[10px] bg-primary/80 px-1.5 py-0.5 rounded">{"\u2B50"} {rec.vote_average?.toFixed(1)}</span>
                      </div>
                    </div>
                    <h4 className="text-foreground text-xs font-medium mt-1.5 line-clamp-2 group-hover:text-primary transition-colors">{rec.title}</h4>
                    {rec.basedOn && (
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{"\u041F\u043E\u0445\u043E\u0436\u0435 \u043D\u0430"} {rec.basedOn}</p>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Link href="/swipe" className="flex-1 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium text-center transition-colors">
            {"\u041D\u043E\u0432\u0430\u044F \u043A\u043E\u043C\u043D\u0430\u0442\u0430"}
          </Link>
          <Link href="/" className="flex-1 py-3 bg-card border border-border hover:border-primary text-foreground rounded-xl font-medium text-center transition-colors">
            {"\u041D\u0430 \u0433\u043B\u0430\u0432\u043D\u0443\u044E"}
          </Link>
        </div>
      </div>
    </main>
  );
}
