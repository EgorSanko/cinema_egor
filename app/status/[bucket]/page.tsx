"use client";

import { useEffect, useState, use } from "react";
import { Navbar } from "@/components/navbar";
import { getAllByStatus, setStatus, type WatchStatus } from "@/lib/status";
import Link from "next/link";
import Image from "next/image";
import { Film, ArrowLeft, Bookmark, Play, Check, X } from "lucide-react";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

const META: Record<WatchStatus, { title: string; emoji: string; icon: any; description: string }> = {
  want:     { title: "Хочу посмотреть", emoji: "📑", icon: Bookmark, description: "Фильмы и сериалы, которые ты отметил «Хочу»" },
  watching: { title: "Смотрю",          emoji: "▶",  icon: Play,     description: "Сериалы которые ты сейчас смотришь" },
  watched:  { title: "Просмотрел",      emoji: "✓",  icon: Check,    description: "Всё что ты отметил как «Просмотрел»" },
};

const VALID: WatchStatus[] = ["want", "watching", "watched"];

export default function StatusBucketPage({ params }: { params: Promise<{ bucket: string }> }) {
  const { bucket } = use(params);
  const status = (VALID.includes(bucket as WatchStatus) ? bucket : "want") as WatchStatus;
  const meta = META[status];

  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    const refresh = () => setItems(getAllByStatus(status));
    refresh();
    window.addEventListener("status-changed", refresh);
    window.addEventListener("sync-complete", refresh);
    return () => {
      window.removeEventListener("status-changed", refresh);
      window.removeEventListener("sync-complete", refresh);
    };
  }, [status]);

  const onRemove = (item: any) => {
    setStatus(item.type, item.id, null, { title: item.title, poster_path: item.poster_path, vote_average: item.vote_average });
  };

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <Link href="/profile" className="inline-flex items-center gap-1.5 text-foreground/55 hover:text-primary text-[13px] font-medium mb-6">
            <ArrowLeft size={14} /> Профиль
          </Link>

          <header className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-3xl" aria-hidden>{meta.emoji}</span>
              <h1 className="text-3xl sm:text-5xl font-black text-foreground tracking-tight">{meta.title}</h1>
            </div>
            <p className="text-foreground/55 text-sm">{meta.description}</p>
            <p className="text-foreground/45 text-[12px] mt-2">{items.length} {plural(items.length, "элемент", "элемента", "элементов")}</p>
          </header>

          {/* Tab nav between buckets */}
          <nav className="flex gap-2 mb-6 overflow-x-auto pb-1">
            {VALID.map(s => {
              const m = META[s];
              const active = s === status;
              return (
                <Link
                  key={s}
                  href={`/status/${s}`}
                  className={`inline-flex items-center gap-1.5 px-4 h-9 rounded-full text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground/[0.04] text-foreground/65 hover:bg-foreground/[0.08] ring-1 ring-white/[0.06]"
                  }`}
                >
                  <span>{m.emoji}</span> {m.title}
                </Link>
              );
            })}
          </nav>

          {items.length === 0 ? (
            <div className="text-center py-16 text-foreground/45">
              <Film size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-[14px]">Пока пусто</p>
              <p className="text-[12px] mt-1">Открой любой фильм или сериал и нажми «{meta.title.split(" ")[0]}»</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {items.map(it => (
                <div key={`${it.type}-${it.id}`} className="group relative">
                  <Link href={it.type === "tv" ? `/tv/${it.id}` : `/movie/${it.id}`} className="block">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/40 transition-all">
                      {it.poster_path ? (
                        <Image src={`${POSTER}/w342${it.poster_path}`} alt={it.title} fill sizes="200px" className="object-cover brightness-[0.92] transition-[filter] duration-300 group-hover:brightness-110" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-foreground/30"><Film size={28} /></div>
                      )}
                      {it.vote_average && it.vote_average > 0 && (
                        <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-amber-300 text-[12px] font-bold">★ {it.vote_average.toFixed(1)}</span>
                      )}
                      {it.type === "tv" && (
                        <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-white/85 text-[11px] font-bold uppercase tracking-wider">TV</span>
                      )}
                    </div>
                    <p className="mt-2 text-foreground/85 text-[12.5px] font-semibold line-clamp-1 group-hover:text-primary">{it.title}</p>
                  </Link>
                  <button
                    onClick={() => onRemove(it)}
                    title="Убрать из списка"
                    className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 backdrop-blur ring-1 ring-white/15 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500/80 z-10"
                  >
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}
