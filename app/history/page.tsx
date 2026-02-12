"use client";

import { Navbar } from "@/components/navbar";
import { getImageUrl } from "@/lib/tmdb";
import { getHistory, clearHistory, type HistoryItem } from "@/lib/storage";
import { Clock, Trash2, Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин. назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч. назад`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} дн. назад`;
  return new Date(ts).toLocaleDateString("ru-RU");
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = () => { setHistory(getHistory()); setLoaded(true); };
  useEffect(() => { load(); }, []);

  const clearAll = () => { if (confirm("Очистить всю историю?")) { clearHistory(); load(); } };

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

  const groups: { label: string; items: HistoryItem[] }[] = [];
  const todayItems = history.filter(h => h.watchedAt >= today.getTime());
  const yesterdayItems = history.filter(h => h.watchedAt >= yesterday.getTime() && h.watchedAt < today.getTime());
  const olderItems = history.filter(h => h.watchedAt < yesterday.getTime());
  if (todayItems.length > 0) groups.push({ label: "Сегодня", items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: "Вчера", items: yesterdayItems });
  if (olderItems.length > 0) groups.push({ label: "Ранее", items: olderItems });

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen pb-20 sm:pb-0">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-foreground mb-2">🕐 История просмотра</h1>
              <p className="text-muted-foreground">{history.length > 0 ? `${history.length} записей` : "Пока пусто"}</p>
            </div>
            {history.length > 0 && (
              <button onClick={clearAll} className="flex items-center gap-2 px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-xl text-sm font-medium transition-colors">
                <Trash2 size={16} /> Очистить
              </button>
            )}
          </div>

          {loaded && history.length === 0 && (
            <div className="text-center py-20">
              <Clock size={64} className="mx-auto text-muted-foreground/30 mb-4" />
              <p className="text-xl text-muted-foreground mb-2">История пуста</p>
              <p className="text-sm text-muted-foreground mb-6">Начните смотреть — ваши фильмы и сериалы появятся здесь</p>
              <Link href="/" className="px-6 py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors inline-block">Перейти к каталогу</Link>
            </div>
          )}

          <div className="space-y-10">
            {groups.map(group => (
              <section key={group.label}>
                <h2 className="text-lg font-semibold text-muted-foreground mb-4">{group.label}</h2>
                <div className="space-y-3">
                  {group.items.map((item, idx) => {
                    const progress = item.duration > 0 ? (item.progress / item.duration) * 100 : 0;
                    const href = item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
                    return (
                      <Link key={`${item.type}-${item.id}-${item.season}-${item.episode}-${idx}`} href={href}>
                        <div className="flex items-center gap-4 p-3 bg-card border border-border rounded-xl hover:border-primary/50 transition-all group cursor-pointer">
                          <div className="relative w-16 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                            <Image src={getImageUrl(item.poster_path, "w92") || "/placeholder.svg"} alt={item.title} fill className="object-cover" sizes="64px" />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play size={20} className="text-white" fill="white" />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-foreground font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">{item.title}</h3>
                            <p className="text-muted-foreground text-xs mt-1">
                              {item.type === "tv" && item.season && item.episode
                                ? `Сезон ${item.season}, Серия ${item.episode}${item.episodeName ? ` — ${item.episodeName}` : ""}`
                                : item.type === "tv" ? "📺 Сериал" : "🎬 Фильм"}
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                              <div className="flex-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${Math.min(progress, 100)}%` }} />
                              </div>
                              <span className="text-[11px] text-muted-foreground whitespace-nowrap">{formatTime(item.progress)} / {formatTime(item.duration)}</span>
                            </div>
                          </div>
                          <div className="flex-shrink-0 text-right">
                            <p className="text-xs text-muted-foreground">{timeAgo(item.watchedAt)}</p>
                            {item.quality && <span className="inline-block mt-1 text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded">{item.quality}</span>}
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
