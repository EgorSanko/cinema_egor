"use client";

import { useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { AnimeCard } from "@/components/anime-card";
import { aniCatalog, aniSearch, type AniRelease } from "@/lib/anilibria";
import { getAnimeContinue, type AnimeHistoryItem } from "@/lib/anime-storage";

// Вкладка «Аниме» — отдельная секция вне TMDB (аниме там не мэпится). Источник —
// Anilibria (CORS открыт, фронт напрямую). Дизайн в духе jut-su, но в бренде:
// салатовый (#a3e635) + розово-фиолетовый (fuchsia/purple).
export default function AnimePage() {
  const [items, setItems] = useState<AniRelease[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);
  const [cont, setCont] = useState<AnimeHistoryItem[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Начальный каталог
  useEffect(() => {
    (async () => { setLoading(true); setItems(await aniCatalog(1, 30)); setLoading(false); })();
  }, []);

  // «Продолжить смотреть» (аниме-история)
  useEffect(() => {
    const read = () => setCont(getAnimeContinue().slice(0, 12));
    read();
    window.addEventListener("anime-history-changed", read);
    return () => window.removeEventListener("anime-history-changed", read);
  }, []);

  // Живой поиск (debounce 400мс). Пустой запрос → вернуть каталог.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      if (searching) { setSearching(false); setLoading(true); setPage(1); aniCatalog(1, 30).then((r) => { setItems(r); setLoading(false); }); }
      return;
    }
    setSearching(true);
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await aniSearch(query);
      setItems(r);
      setLoading(false);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const loadMore = async () => {
    if (searching || loadingMore) return;
    setLoadingMore(true);
    const next = page + 1;
    const more = await aniCatalog(next, 30);
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
              Онгоинги и релизы с озвучкой <span className="text-fuchsia-300/90 font-medium">AniLibria</span> — прямой HLS в нашем плеере, без рекламы.
            </p>
            {/* Поиск */}
            <div className="mt-4 relative max-w-lg">
              <svg className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-fuchsia-300/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Поиск аниме — «Наруто», «Ван Пис»…"
                className="w-full h-11 rounded-full bg-black/45 border border-fuchsia-400/25 focus:border-lime-400/60 pl-11 pr-5 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/50"
              />
            </div>
          </div>
        </div>

        {/* Продолжить смотреть */}
        {!searching && cont.length > 0 && (
          <div className="mb-7">
            <div className="mb-3 flex items-center gap-2">
              <span className="w-1 h-5 rounded-full bg-gradient-to-b from-fuchsia-500 to-lime-400" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">Продолжить смотреть</h2>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1">
              {cont.map((h) => {
                const pct = h.duration ? Math.min(100, Math.round((h.progress / h.duration) * 100)) : 0;
                return (
                  <Link key={h.id + "-" + h.ordinal} href={`/anime/${h.id}`} className="group shrink-0 w-[150px]">
                    <div className="relative aspect-video rounded-lg overflow-hidden ring-1 ring-white/[0.07] group-hover:ring-fuchsia-400/50 transition-all bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={h.poster} alt={h.title} loading="lazy" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 grid place-items-center bg-black/25 opacity-0 group-hover:opacity-100 transition">
                        <svg width="30" height="30" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z" /></svg>
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/15">
                        <div className="h-full bg-gradient-to-r from-lime-400 to-fuchsia-400" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="mt-1 text-[12px] font-medium text-foreground/85 line-clamp-1">{h.title}</div>
                    <div className="text-[10.5px] text-muted-foreground">серия {h.ordinal} · {pct}%</div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Заголовок секции */}
        <div className="mb-4 flex items-center gap-2">
          <span className="w-1 h-5 rounded-full bg-gradient-to-b from-lime-400 to-fuchsia-500" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {searching ? "Результаты поиска" : "Свежие релизы"}
          </h2>
        </div>

        {/* Сетка */}
        {loading && items.length === 0 ? (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
            {Array.from({ length: 18 }).map((_, i) => (
              <div key={i} className="aspect-[2/3] rounded-xl bg-white/[0.04] animate-pulse ring-1 ring-white/[0.05]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-muted-foreground">
            {searching ? "Ничего не найдено — попробуйте другое название" : "Каталог временно недоступен"}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
              {items.map((r) => <AnimeCard key={r.id} r={r} />)}
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
