"use client";

import { getHistory } from "@/lib/storage";
import { getImageUrl } from "@/lib/tmdb";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";
import { MovieCardSkeleton } from "./skeletons";

interface RecommendedItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string | null;
  vote_average: number;
  media_type: string;
}

export function Recommendations() {
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecommendations = async () => {
      const history = getHistory();
      if (history.length === 0) { setLoading(false); return; }

      // Get unique movie IDs from history (last 5)
      const seen = new Set<string>();
      const sources: { id: number; type: string }[] = [];
      for (const h of history) {
        const key = `${h.type}-${h.id}`;
        if (!seen.has(key) && sources.length < 5) {
          seen.add(key);
          sources.push({ id: h.id, type: h.type });
        }
      }

      try {
        const allRecs: RecommendedItem[] = [];
        const seenIds = new Set<string>();

        for (const src of sources.slice(0, 3)) {
          const endpoint = src.type === "tv"
            ? `/api/tmdb-proxy?path=/tv/${src.id}/recommendations`
            : `/api/tmdb-proxy?path=/movie/${src.id}/recommendations`;

          const res = await fetch(endpoint);
          if (res.ok) {
            const data = await res.json();
            for (const item of (data.results || []).slice(0, 6)) {
              const key = `${item.media_type || src.type}-${item.id}`;
              if (!seenIds.has(key) && !history.some(h => h.id === item.id && h.type === (item.media_type || src.type))) {
                seenIds.add(key);
                allRecs.push({ ...item, media_type: item.media_type || src.type });
              }
            }
          }
        }

        setItems(allRecs.slice(0, 12));
      } catch { }
      finally { setLoading(false); }
    };

    fetchRecommendations();
  }, []);

  if (!loading && items.length === 0) return null;

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">Рекомендации для вас</h2>
        <div className="h-1 w-16 bg-primary rounded mt-2" />
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <MovieCardSkeleton key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {items.map(item => {
            const title = item.title || item.name || "";
            const href = item.media_type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
            return (
              <Link key={`${item.media_type}-${item.id}`} href={href}>
                <div className="group cursor-pointer h-full">
                  <div className="relative overflow-hidden rounded-lg aspect-[2/3] bg-card">
                    <Image
                      src={getImageUrl(item.poster_path, "w342") || "/placeholder.svg"}
                      alt={title}
                      fill
                      className="object-cover group-hover:scale-110 transition-all duration-300"
                      sizes="(max-width: 768px) 50vw, 185px"
                    />
                    {item.media_type === "tv" && (
                      <div className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase z-10">Сериал</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-white text-sm font-semibold line-clamp-2">{title}</h3>
                        <p className="text-gray-300 text-xs mt-1">⭐ {item.vote_average?.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
