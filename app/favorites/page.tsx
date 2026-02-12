"use client";

import { Navbar } from "@/components/navbar";
import { getImageUrl } from "@/lib/tmdb";
import { getFavorites, toggleFavorite, clearFavorites, type FavoriteItem } from "@/lib/storage";
import { Heart, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => { setFavorites(getFavorites()); setLoaded(true); };

  useEffect(() => {
    load();
    const handler = () => load();
    window.addEventListener("favorites-changed", handler);
    return () => window.removeEventListener("favorites-changed", handler);
  }, []);

  const remove = (item: FavoriteItem) => { toggleFavorite(item); load(); };

  const clearAll = () => { if (confirm("Очистить всё избранное?")) { clearFavorites(); load(); } };

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen pb-20 sm:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">❤️ Избранное</h1>
              <p className="text-muted-foreground">{favorites.length > 0 ? `${favorites.length} сохранённых` : "Пока пусто"}</p>
            </div>
            {favorites.length > 0 && (
              <button onClick={clearAll} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl text-sm font-medium transition-colors">
                <Trash2 size={16} /> Очистить
              </button>
            )}
          </div>

          {loaded && favorites.length === 0 && (
            <div className="text-center py-20">
              <Heart size={64} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-xl text-muted-foreground mb-2">Здесь пока пусто</p>
              <p className="text-sm text-muted-foreground mb-6">Нажмите ❤️ на фильме или сериале, чтобы добавить</p>
              <Link href="/" className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors inline-block">Перейти к каталогу</Link>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {favorites.map((item) => (
              <div key={`${item.type}-${item.id}`} className="group relative">
                <Link href={item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`}>
                  <div className="relative overflow-hidden rounded-lg aspect-[2/3] bg-card">
                    <Image src={getImageUrl(item.poster_path, "w342") || "/placeholder.svg"} alt={item.title} fill
                      className="object-cover group-hover:scale-110 transition-all duration-300" sizes="(max-width: 768px) 50vw, 185px" />
                    {item.type === "tv" && (
                      <div className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase z-10">Сериал</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="absolute bottom-0 left-0 right-0 p-3">
                        <h3 className="text-white text-sm font-semibold line-clamp-2">{item.title}</h3>
                        <p className="text-gray-300 text-xs mt-1">⭐ {item.vote_average.toFixed(1)}</p>
                      </div>
                    </div>
                  </div>
                </Link>
                <button onClick={() => remove(item)}
                  className="absolute top-2 right-2 z-10 bg-black/60 backdrop-blur-sm rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500/80">
                  <X size={14} className="text-white" />
                </button>
                <div className="mt-2 px-1">
                  <h3 className="text-foreground text-sm font-medium line-clamp-1">{item.title}</h3>
                  <p className="text-muted-foreground text-xs">{item.type === "tv" ? "📺 Сериал" : "🎬 Фильм"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
