"use client";

import { useEffect, useState, useRef } from "react";
import { Navbar } from "@/components/navbar";
import { TVCard } from "@/components/tv-card";

// Вкладка «Аниме» — каталог из TMDB (мультфильмы genre=16 на японском), карточки
// ведут на обычную /tv/[id], где играет наш плеер через Alloha (Плеер 1): ПОЛНЫЕ
// каталоги + ВСЕ озвучки (Ван-Пис 24 дубляжа) + история/прогресс/сезоны. Аниме в
// Alloha ключуется по imdb (у нас есть через TMDB) — потому и работает.
// Дизайн в бренде: салатовый (#a3e635) + розово-фиолетовый (fuchsia/purple).

const KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY || "275c9d09780aadb4b13ff57a731eda00";
// Аниме: анимация (16) + японский оригинал, по популярности.
const DISCOVER = "discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&vote_count.gte=40";

async function tmdb(path: string): Promise<any[]> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const r = await fetch(`/tmdb-api/${path}${sep}api_key=${KEY}&language=ru-RU&include_adult=false`);
    const d = await r.json();
    return d.results || [];
  } catch { return []; }
}

export default function AnimePage() {
  const [items, setItems] = useState<any[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const deb = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => { setLoading(true); setItems(await tmdb(`${DISCOVER}&page=1`)); setLoading(false); })();
  }, []);

  useEffect(() => {
    if (deb.current) clearTimeout(deb.current);
    if (!query.trim()) {
      if (searching) { setSearching(false); setLoading(true); setPage(1); tmdb(`${DISCOVER}&page=1`).then((r) => { setItems(r); setLoading(false); }); }
      return;
    }
    setSearching(true);
    setLoading(true);
    deb.current = setTimeout(async () => {
      const res = await tmdb(`search/tv?query=${encodeURIComponent(query)}`);
      // Приоритет аниме (японские / анимация), но если таких нет — показываем всё найденное.
      const anime = res.filter((s: any) => s.original_language === "ja" || (s.genre_ids || []).includes(16));
      setItems(anime.length ? anime : res);
      setLoading(false);
    }, 400);
    return () => { if (deb.current) clearTimeout(deb.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadMore = async () => {
    if (searching || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const more = await tmdb(`${DISCOVER}&page=${next}`);
    setItems((p) => [...p, ...more]);
    setPage(next);
    setLoadingMore(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="max-w-[1400px] mx-auto px-4 sm:px-6 pt-5 pb-16">
        {/* Герой */}
        <div className="relative mb-6 rounded-2xl overflow-hidden ring-1 ring-white/[0.07] bg-gradient-to-br from-fuchsia-500/[0.16] via-purple-500/[0.10] to-lime-400/[0.10] p-5 sm:p-8">
          <div className="pointer-events-none absolute -top-16 -right-10 w-64 h-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 w-64 h-64 rounded-full bg-lime-400/15 blur-3xl" />
          <div className="relative">
            <h1 className="text-2xl sm:text-4xl font-black tracking-tight">
              <span className="bg-gradient-to-r from-lime-300 via-fuchsia-400 to-purple-400 bg-clip-text text-transparent">Аниме</span>
            </h1>
            <p className="mt-1.5 text-[13px] sm:text-sm text-muted-foreground max-w-xl">
              Полные каталоги и <span className="text-fuchsia-300/90 font-medium">все озвучки</span> — играет в нашем плеере (сезоны, серии, история просмотра).
            </p>
            <div className="mt-4 relative max-w-lg">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fuchsia-300/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск аниме — «Ван-Пис», «Наруто», «Атака титанов»…"
                className="w-full h-11 rounded-full bg-black/45 border border-fuchsia-400/25 focus:border-lime-400/60 pl-11 pr-5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        </div>

        {/* Заголовок секции */}
        <div className="mb-4 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-lime-400 to-fuchsia-500" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {searching ? "Результаты поиска" : "Популярное аниме"}
          </h2>
        </div>

        {/* Сетка */}
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-lg bg-white/[0.04] animate-pulse ring-1 ring-white/[0.05]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            {searching ? "Ничего не найдено — попробуйте другое название" : "Каталог временно недоступен"}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
              {items.map((s) => <TVCard key={s.id} show={s} />)}
            </div>
            {!searching && (
              <div className="mt-8 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="px-7 h-11 rounded-full font-semibold text-black bg-gradient-to-r from-lime-400 to-fuchsia-400 hover:opacity-90 disabled:opacity-50 transition"
                >
                  {loadingMore ? "Загрузка…" : "Показать ещё"}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
