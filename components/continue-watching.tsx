"use client";

import { getHistory, type HistoryItem } from "@/lib/storage";
import { getImageUrl } from "@/lib/tmdb";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`;
}

export function ContinueWatching() {
  const [items, setItems] = useState<HistoryItem[]>([]);

  useEffect(() => {
    const history = getHistory();
    // Show items that are not finished (< 95% watched)
    const inProgress = history
      .filter(h => h.duration > 0 && (h.progress / h.duration) < 0.95 && h.progress > 30);

    // Deduplicate: for series keep only the latest episode per show
    const seen = new Map<string, HistoryItem>();
    for (const h of inProgress) {
      const key = `${h.type}-${h.id}`;
      if (!seen.has(key) || h.watchedAt > (seen.get(key)!.watchedAt || 0)) {
        seen.set(key, h);
      }
    }
    setItems(Array.from(seen.values()).slice(0, 12));
  }, []);

  useEffect(() => {
    const onSync = () => {
      const history = getHistory();
      const inProgress = history
        .filter(h => h.duration > 0 && (h.progress / h.duration) < 0.95 && h.progress > 30);
      const seen = new Map<string, HistoryItem>();
      for (const h of inProgress) {
        const key = `${h.type}-${h.id}`;
        if (!seen.has(key) || h.watchedAt > (seen.get(key)!.watchedAt || 0)) {
          seen.set(key, h);
        }
      }
      setItems(Array.from(seen.values()).slice(0, 12));
    };
    window.addEventListener("sync-complete", onSync);
    return () => window.removeEventListener("sync-complete", onSync);
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{"\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440"}</h2>
          <div className="h-1 w-16 bg-primary rounded mt-2" />
        </div>
        <Link href="/history" className="text-sm text-muted-foreground hover:text-primary transition-colors">
          {"\u0412\u0441\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u2192"}
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map((item, idx) => {
          const progress = (item.progress / item.duration) * 100;
          const href = item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
          return (
            <Link key={`${item.type}-${item.id}-${idx}`} href={href}>
              <div className="group cursor-pointer h-full">
                <div className="relative overflow-hidden rounded-lg aspect-[2/3] bg-card">
                  <Image
                    src={getImageUrl(item.poster_path, "w342") || "/placeholder.svg"}
                    alt={item.title}
                    fill
                    className="object-cover group-hover:scale-110 transition-all duration-300"
                    sizes="(max-width: 768px) 50vw, 185px"
                  />
                  {/* Progress bar at bottom */}
                  <div className="absolute bottom-0 left-0 right-0">
                    <div className="h-1 bg-gray-800">
                      <div className="h-full bg-primary" style={{ width: `${progress}%` }} />
                    </div>
                  </div>
                  {/* Play overlay */}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center">
                      <Play size={24} className="text-white ml-1" fill="white" />
                    </div>
                  </div>
                  {/* Time remaining */}
                  <div className="absolute bottom-2 right-2 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                    {formatTime(item.duration - item.progress)}
                  </div>
                  {item.type === "tv" && item.season && item.episode && (
                    <div className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded-md">
                      S{item.season}E{item.episode}
                    </div>
                  )}
                </div>
                <div className="mt-2 px-1">
                  <h3 className="text-foreground text-sm font-medium line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-xs">
                    {item.type === "tv" && item.season && item.episode
                      ? `\u0421\u0435\u0437\u043e\u043d ${item.season}, \u0421\u0435\u0440\u0438\u044f ${item.episode}`
                      : formatTime(item.progress) + " \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u043e"}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
