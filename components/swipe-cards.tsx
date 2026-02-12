"use client";

import { getImageUrl } from "@/lib/tmdb";
import { Heart, X, ChevronDown, Check } from "lucide-react";
import Image from "next/image";
import { useState, useRef, useCallback, useEffect } from "react";

interface SwipeMovie {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  overview?: string;
  genre_ids?: number[];
  type?: "movie" | "tv";
  sharedGenre?: boolean;
}

interface SwipeCardsProps {
  movies: SwipeMovie[];
  roomCode: string;
  playerName: string;
  onComplete: () => void;
}

const GENRE_MAP: Record<number, string> = {
  28: "Экшн", 12: "Приключения", 16: "Анимация", 35: "Комедия",
  80: "Криминал", 99: "Документальный", 18: "Драма", 10751: "Семейный",
  14: "Фэнтези", 36: "Исторический", 27: "Ужасы", 10402: "Музыка",
  9648: "Детектив", 10749: "Мелодрама", 878: "Фантастика",
  53: "Триллер", 10752: "Военный", 37: "Вестерн",
};

export function SwipeCards({ movies, roomCode, playerName, onComplete }: SwipeCardsProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [stats, setStats] = useState({ liked: 0, skipped: 0 });
  const startPos = useRef({ x: 0, y: 0 });

  const currentMovie = movies[currentIndex];

  const sendVote = async (movie: SwipeMovie, direction: "left" | "right") => {
    const movieKey = `${movie.type || "movie"}-${movie.id}`;
    try {
      await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "swipe", code: roomCode, playerName, movieKey, direction }),
      });
    } catch {}
  };

  const handleSwipe = useCallback((direction: "left" | "right") => {
    if (!currentMovie || exitDirection) return;
    if (direction === "right") setStats(s => ({ ...s, liked: s.liked + 1 }));
    else setStats(s => ({ ...s, skipped: s.skipped + 1 }));

    sendVote(currentMovie, direction);
    setExitDirection(direction);
    setShowDetails(false);

    setTimeout(() => {
      setExitDirection(null);
      setDragX(0);
      setDragY(0);
      const nextIdx = currentIndex + 1;
      setCurrentIndex(nextIdx);
      if (nextIdx >= movies.length) {
        fetch("/api/swipe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "done", code: roomCode, playerName }),
        }).then(() => onComplete());
      }
    }, 400);
  }, [currentMovie, exitDirection, currentIndex, movies.length, roomCode, playerName, onComplete]);

  const handleTouchStart = (e: React.TouchEvent) => {
    startPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    setIsDragging(true);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    setDragX(e.touches[0].clientX - startPos.current.x);
    setDragY((e.touches[0].clientY - startPos.current.y) * 0.3);
  };
  const handleTouchEnd = () => {
    setIsDragging(false);
    if (Math.abs(dragX) > 100) handleSwipe(dragX > 0 ? "right" : "left");
    else { setDragX(0); setDragY(0); }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    startPos.current = { x: e.clientX, y: e.clientY };
    setIsDragging(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setDragX(e.clientX - startPos.current.x);
    setDragY((e.clientY - startPos.current.y) * 0.3);
  };
  const handleMouseUp = () => {
    setIsDragging(false);
    if (Math.abs(dragX) > 100) handleSwipe(dragX > 0 ? "right" : "left");
    else { setDragX(0); setDragY(0); }
  };

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") handleSwipe("left");
      if (e.key === "ArrowRight") handleSwipe("right");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleSwipe]);

  const rotation = dragX * 0.08;
  const opacity = Math.min(Math.abs(dragX) / 150, 1);
  const title = currentMovie?.title || currentMovie?.name || "";
  const genres = (currentMovie?.genre_ids || []).map(id => GENRE_MAP[id]).filter(Boolean);

  const getCardStyle = () => {
    if (exitDirection) {
      return {
        transform: `translateX(${exitDirection === "right" ? 1200 : -1200}px) rotate(${exitDirection === "right" ? 30 : -30}deg)`,
        transition: "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
      };
    }
    return {
      transform: `translateX(${dragX}px) translateY(${dragY}px) rotate(${rotation}deg)`,
      transition: isDragging ? "none" : "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
      cursor: isDragging ? "grabbing" : "grab",
    };
  };

  if (!currentMovie || currentIndex >= movies.length) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center text-center gap-5">
        <div className="w-20 h-20 rounded-full bg-green-500/20 flex items-center justify-center">
          <Check size={40} className="text-green-400" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Готово!</h2>
        <p className="text-muted-foreground">❤️ {stats.liked} · ✕ {stats.skipped}</p>
        <p className="text-muted-foreground text-sm">Ожидание партнёра...</p>
        <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const nextMovie = movies[currentIndex + 1];

  return (
    <div className="flex flex-col items-center">
      <div className="w-full max-w-sm mb-4">
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-sm text-muted-foreground">{playerName}</span>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-green-400">❤️ {stats.liked}</span>
            <span className="text-muted-foreground">{currentIndex + 1}/{movies.length}</span>
          </div>
        </div>
        <div className="h-1 bg-card rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${(currentIndex / movies.length) * 100}%` }} />
        </div>
      </div>

      <div className="relative w-full max-w-sm mx-auto" style={{ height: "500px" }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}>

        {nextMovie && (
          <div className="absolute inset-0 mx-4 mt-4">
            <div className="w-full h-full rounded-3xl overflow-hidden bg-card border border-border shadow-xl">
              <Image src={getImageUrl(nextMovie.poster_path, "w500") || "/placeholder.svg"}
                alt="" fill className="object-cover opacity-50" sizes="400px" />
            </div>
          </div>
        )}

        <div className="absolute inset-0 z-10 select-none" style={getCardStyle()}
          onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}>

          <div className="w-full h-full rounded-3xl overflow-hidden bg-card border border-border shadow-2xl relative">
            <div className="relative w-full h-full">
              <Image src={getImageUrl(currentMovie.poster_path, "w500") || "/placeholder.svg"}
                alt={title} fill className="object-cover" sizes="400px" priority />

              {dragX > 30 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ opacity }}>
                  <div className="border-4 border-green-500 text-green-500 text-4xl font-black px-6 py-3 rounded-2xl rotate-[-15deg] bg-green-500/10 backdrop-blur-sm">
                    ХОЧУ 🔥
                  </div>
                </div>
              )}
              {dragX < -30 && (
                <div className="absolute inset-0 z-20 flex items-center justify-center" style={{ opacity }}>
                  <div className="border-4 border-red-500 text-red-500 text-4xl font-black px-6 py-3 rounded-2xl rotate-[15deg] bg-red-500/10 backdrop-blur-sm">
                    НЕ-А
                  </div>
                </div>
              )}

              {/* Shared genre badge */}
              {currentMovie.sharedGenre && (
                <div className="absolute top-4 left-4 z-10 bg-green-500/90 text-white text-[10px] font-bold px-2.5 py-1 rounded-lg">
                  ✨ Общий жанр
                </div>
              )}

              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent p-5 pt-20 z-10">
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-primary text-white text-xs px-2.5 py-1 rounded-lg font-bold">
                    ⭐ {currentMovie.vote_average.toFixed(1)}
                  </span>
                  {(currentMovie.release_date || currentMovie.first_air_date) && (
                    <span className="bg-white/10 text-white/80 text-xs px-2.5 py-1 rounded-lg">
                      {new Date(currentMovie.release_date || currentMovie.first_air_date || "").getFullYear()}
                    </span>
                  )}
                  {currentMovie.type === "tv" && (
                    <span className="bg-blue-500/80 text-white text-xs px-2.5 py-1 rounded-lg font-bold">Сериал</span>
                  )}
                </div>
                <h2 className="text-white text-2xl font-bold leading-tight mb-2">{title}</h2>
                {genres.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {genres.slice(0, 3).map(g => (
                      <span key={g} className="text-white/60 text-xs bg-white/10 px-2 py-0.5 rounded-md">{g}</span>
                    ))}
                  </div>
                )}
                <button onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
                  className="text-white/60 text-xs flex items-center gap-1 hover:text-white transition-colors">
                  <ChevronDown size={14} className={`transition-transform ${showDetails ? "rotate-180" : ""}`} />
                  {showDetails ? "Скрыть" : "Подробнее"}
                </button>
                {showDetails && currentMovie.overview && (
                  <p className="text-white/70 text-sm mt-2 line-clamp-4 leading-relaxed">{currentMovie.overview}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center gap-6 mt-6">
        <button onClick={() => handleSwipe("left")}
          className="w-16 h-16 rounded-full bg-card border-2 border-red-500/50 flex items-center justify-center text-red-400 hover:bg-red-500/10 hover:border-red-500 hover:scale-110 transition-all shadow-lg active:scale-95">
          <X size={32} strokeWidth={3} />
        </button>
        <button onClick={() => handleSwipe("right")}
          className="w-16 h-16 rounded-full bg-card border-2 border-green-500/50 flex items-center justify-center text-green-400 hover:bg-green-500/10 hover:border-green-500 hover:scale-110 transition-all shadow-lg active:scale-95">
          <Heart size={32} strokeWidth={2.5} fill="currentColor" />
        </button>
      </div>
      <p className="text-muted-foreground text-xs mt-4 text-center">← Не хочу · Хочу посмотреть →</p>
    </div>
  );
}
