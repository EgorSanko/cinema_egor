// app/watch/create/page.tsx - Search and select a movie to watch together
"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, ArrowLeft, Film, Tv, Star, Loader2, X } from "lucide-react";
import Link from "next/link";
import { connectSocket } from "@/lib/socket";

export default function CreateWatchWrapper() {
  return <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 size={32} className="animate-spin text-purple-500" /></div>}><CreateWatchPage /></Suspense>;
}

const TMDB_BASE = process.env.NEXT_PUBLIC_TMDB_BASE_URL || "https://api.themoviedb.org/3";
const TMDB_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "";

interface SearchResult {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  media_type?: string;
  overview: string;
}

function CreateWatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const autoCreated = useRef(false);
  const [trending, setTrending] = useState<SearchResult[]>([]);
  const searchTimer = useRef<any>(null);

  // Series episode picker — clicking a series opens this instead of creating S1E1.
  const [pendingSeries, setPendingSeries] = useState<SearchResult | null>(null);
  const [seasonsCount, setSeasonsCount] = useState(1);
  const [pickSeason, setPickSeason] = useState(1);
  const [episodes, setEpisodes] = useState<{ episode_number: number; name: string }[]>([]);
  const [epLoading, setEpLoading] = useState(false);

  // Auto-create room if coming from movie player with params
  useEffect(() => {
    if (autoCreated.current) return;
    const qParam = searchParams.get("q");
    const idParam = searchParams.get("id");
    const typeParam = searchParams.get("type");
    const yearParam = searchParams.get("year");
    const posterParam = searchParams.get("poster");
    const seasonParam = searchParams.get("season");
    const episodeParam = searchParams.get("episode");
    if (qParam && idParam) {
      autoCreated.current = true;
      selectMovie({
        id: parseInt(idParam),
        title: qParam,
        poster_path: posterParam || null,
        vote_average: 0,
        release_date: yearParam ? `${yearParam}-01-01` : undefined,
        media_type: typeParam || "movie",
        overview: "",
      }, seasonParam ? parseInt(seasonParam) : undefined, episodeParam ? parseInt(episodeParam) : undefined);
    }
  }, [searchParams]);

  // Load trending on mount
  useEffect(() => {
    fetch(`${TMDB_BASE}/trending/all/week?api_key=${TMDB_KEY}&language=ru-RU`)
      .then((r) => r.json())
      .then((d) => setTrending((d.results || []).filter((r: any) => r.poster_path).slice(0, 12)))
      .catch(() => {});
  }, []);

  // Debounced search
  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (!query.trim()) { setResults([]); return; }
    searchTimer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${TMDB_BASE}/search/multi?api_key=${TMDB_KEY}&language=ru-RU&query=${encodeURIComponent(query)}`);
        const data = await res.json();
        setResults((data.results || []).filter((r: any) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path).slice(0, 20));
      } catch {}
      setLoading(false);
    }, 400);
  }, [query]);

  const selectMovie = (item: SearchResult, season?: number, episode?: number) => {
    const name = typeof window !== "undefined" ? localStorage.getItem("watch_name") || "Host" : "Host";
    const type = item.media_type === "tv" ? "tv" : "movie";
    const title = item.title || item.name || "";
    const year = (item.release_date || item.first_air_date || "").split("-")[0];

    setCreating(true);
    const socket = connectSocket();

    socket.emit("create-room", {
      name,
      movieId: item.id,
      movieTitle: title,
      moviePoster: item.poster_path,
      movieType: type,
      movieYear: year,
      isSeries: type === "tv",
      season: type === "tv" ? (season || 1) : undefined,
      episode: type === "tv" ? (episode || 1) : undefined,
    }, (res) => {
      setCreating(false);
      if (res.error) { alert(res.error); return; }
      if (res.code) {
        router.push(`/watch/${res.code}`);
      }
    });
  };

  // Clicking a series opens a season/episode picker (instead of defaulting to S1E1).
  const openSeriesPicker = async (item: SearchResult) => {
    setPendingSeries(item);
    setPickSeason(1);
    setEpisodes([]);
    try {
      const r = await fetch(`${TMDB_BASE}/tv/${item.id}?api_key=${TMDB_KEY}&language=ru-RU`);
      const d = await r.json();
      setSeasonsCount(Math.max(1, d.number_of_seasons || 1));
    } catch { setSeasonsCount(1); }
    loadPickerEpisodes(item.id, 1);
  };

  const loadPickerEpisodes = async (id: number, season: number) => {
    setEpLoading(true);
    try {
      const r = await fetch(`/api/tv-episodes?id=${id}&season=${season}`);
      const eps = await r.json();
      setEpisodes(Array.isArray(eps) ? eps : []);
    } catch { setEpisodes([]); }
    setEpLoading(false);
  };

  const renderItem = (item: SearchResult, i: number) => {
    const title = item.title || item.name || "";
    const year = (item.release_date || item.first_air_date || "").split("-")[0];
    const type = item.media_type === "tv" ? "tv" : "movie";

    return (
      <button key={`${type}-${item.id}-${i}`} onClick={() => type === "tv" ? openSeriesPicker(item) : selectMovie(item)} disabled={creating}
        className="flex gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group w-full disabled:opacity-50">
        <div className="w-16 h-24 rounded-lg overflow-hidden bg-gray-800 shrink-0">
          {item.poster_path ? (
            <img src={`/tmdb-img/w200${item.poster_path}`} alt={title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Film size={20} className="text-gray-600" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 py-1">
          <p className="text-white font-medium truncate group-hover:text-purple-300 transition-colors">{title}</p>
          <div className="flex items-center gap-2 mt-1">
            {type === "tv" ? <Tv size={12} className="text-blue-400" /> : <Film size={12} className="text-gray-400" />}
            <span className="text-gray-500 text-xs">{type === "tv" ? "Сериал" : "Фильм"}</span>
            {year && <span className="text-gray-500 text-xs">{year}</span>}
            {item.vote_average > 0 && (
              <span className="flex items-center gap-1 text-xs text-yellow-500">
                <Star size={10} fill="currentColor" /> {item.vote_average.toFixed(1)}
              </span>
            )}
          </div>
          {item.overview && <p className="text-gray-500 text-xs mt-1 line-clamp-2">{item.overview}</p>}
        </div>
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6 pt-4">
          <Link href="/watch" className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-xl font-bold text-white">Выберите фильм</h1>
        </div>

        {/* Search */}
        <div className="relative mb-6">
          <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Найти фильм или сериал..."
            className="w-full pl-12 pr-5 py-4 bg-white/[0.06] border-2 border-white/10 rounded-2xl text-white text-lg placeholder-gray-600 focus:border-purple-500 focus:outline-none transition-colors"
            autoFocus
          />
        </div>

        {creating && (
          <div className="flex items-center justify-center gap-3 text-gray-400 py-8">
            <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            Создание комнаты...
          </div>
        )}

        {/* Results or trending */}
        {!creating && (
          <div className="space-y-1">
            {loading && (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
              </div>
            )}

            {!loading && query && results.length === 0 && (
              <p className="text-gray-500 text-center py-8">Ничего не найдено</p>
            )}

            {!loading && results.length > 0 && results.map((item, i) => renderItem(item, i))}

            {!query && !loading && (
              <>
                <p className="text-gray-500 text-sm mb-3 px-1">Популярное на этой неделе</p>
                {trending.map((item, i) => renderItem({ ...item, media_type: item.media_type || ((item as any).first_air_date ? "tv" : "movie") }, i))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Series episode picker */}
      {pendingSeries && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
          onClick={() => setPendingSeries(null)}
        >
          <div
            className="bg-gray-950 border border-white/10 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 border-b border-white/10">
              <Tv size={18} className="text-purple-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-white font-semibold truncate">{pendingSeries.name || pendingSeries.title}</p>
                <p className="text-gray-500 text-xs">Выберите серию для совместного просмотра</p>
              </div>
              <button onClick={() => setPendingSeries(null)} className="text-gray-400 hover:text-white transition-colors shrink-0">
                <X size={20} />
              </button>
            </div>

            <div className="flex gap-2 p-4 overflow-x-auto border-b border-white/10">
              {Array.from({ length: seasonsCount }, (_, i) => i + 1).map((s) => (
                <button
                  key={s}
                  onClick={() => { setPickSeason(s); loadPickerEpisodes(pendingSeries.id, s); }}
                  className={`shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium transition-colors ${
                    pickSeason === s ? "bg-purple-500 text-white" : "bg-white/5 text-gray-300 hover:bg-white/10"
                  }`}
                >
                  Сезон {s}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {epLoading && (
                <div className="flex justify-center py-8">
                  <Loader2 size={24} className="animate-spin text-purple-500" />
                </div>
              )}
              {!epLoading && episodes.length === 0 && (
                <p className="text-gray-500 text-center py-8 text-sm">Серии не найдены</p>
              )}
              {!epLoading && episodes.map((ep) => (
                <button
                  key={ep.episode_number}
                  disabled={creating}
                  onClick={() => { const it = pendingSeries; setPendingSeries(null); selectMovie(it, pickSeason, ep.episode_number); }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 text-left disabled:opacity-50 transition-colors"
                >
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-purple-500/15 text-purple-300 text-sm font-bold flex items-center justify-center">
                    {ep.episode_number}
                  </span>
                  <span className="text-white text-sm truncate flex-1">{ep.name || `Серия ${ep.episode_number}`}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
