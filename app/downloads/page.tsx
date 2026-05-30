"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Download, Trash2, RefreshCw, Film, Tv as TvIcon, Calendar } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getDownloads, deleteDownload, clearAllDownloads, buildFilename, triggerBrowserDownload, type DownloadEntry } from "@/lib/downloads";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

function fmtAgo(ts: number) {
  const sec = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (sec < 60) return "только что";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} мин назад`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d} д назад`;
  return new Date(ts).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" });
}

export default function DownloadsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<DownloadEntry[]>([]);
  const [filter, setFilter] = useState<"all" | "movie" | "tv">("all");

  useEffect(() => {
    const refresh = () => setItems(getDownloads());
    refresh();
    window.addEventListener("downloads-changed", refresh);
    window.addEventListener("sync-complete", refresh);
    return () => {
      window.removeEventListener("downloads-changed", refresh);
      window.removeEventListener("sync-complete", refresh);
    };
  }, []);

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-5">
            <span className="text-6xl">⬇️</span>
            <h1 className="text-3xl font-bold text-foreground">Войдите чтобы увидеть загрузки</h1>
            <p className="text-foreground/55">История скачанных фильмов и серий доступна только зарегистрированным пользователям — синхронизируется между устройствами.</p>
            <Link href="/" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold">На главную</Link>
          </div>
        </main>
      </>
    );
  }

  const visible = filter === "all" ? items : items.filter(i => i.type === filter);
  const movies = items.filter(i => i.type === "movie").length;
  const episodes = items.filter(i => i.type === "tv").length;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-24">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-8 sm:pt-10 space-y-6">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Загрузки</h1>
              <p className="text-foreground/55 text-sm mt-1.5">
                {items.length === 0
                  ? "Пока ничего не скачано"
                  : `${movies} ${movies === 1 ? "фильм" : movies > 1 && movies < 5 ? "фильма" : "фильмов"} · ${episodes} ${episodes === 1 ? "серия" : episodes > 1 && episodes < 5 ? "серии" : "серий"}`}
              </p>
            </div>
            {items.length > 0 && (
              <button
                onClick={() => { if (confirm("Очистить всю историю загрузок?")) clearAllDownloads(); }}
                className="inline-flex items-center gap-2 h-9 px-3.5 rounded-full bg-foreground/[0.05] ring-1 ring-white/[0.06] text-foreground/65 hover:text-red-400 hover:bg-red-400/10 hover:ring-red-400/30 transition-colors text-[12.5px] font-medium"
              >
                <Trash2 size={13} /> Очистить
              </button>
            )}
          </div>

          {items.length > 0 && (
            <div className="flex items-center gap-2">
              {(["all", "movie", "tv"] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`h-9 px-4 rounded-full text-[13px] font-medium transition-colors ${
                    filter === f
                      ? "bg-primary text-primary-foreground"
                      : "bg-foreground/[0.05] ring-1 ring-white/[0.06] text-foreground/70 hover:bg-foreground/[0.08]"
                  }`}
                >
                  {f === "all" ? "Все" : f === "movie" ? "Фильмы" : "Сериалы"}
                </button>
              ))}
            </div>
          )}

          {visible.length === 0 ? (
            <div className="text-center py-20 text-foreground/45">
              {items.length === 0 ? (
                <>
                  <Download size={40} className="mx-auto mb-4 opacity-30" />
                  <p className="text-foreground/70 mb-1.5">Нет скачанных файлов</p>
                  <p className="text-[13px]">Открой любой фильм или серию и нажми «Скачать» — здесь появится история.</p>
                </>
              ) : (
                <p className="text-[13px]">В этой категории пусто</p>
              )}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {visible.map((d) => (
                <li
                  key={`${d.type}-${d.id}-s${d.season ?? 0}e${d.episode ?? 0}-${d.quality}-${d.downloadedAt}`}
                  className="group relative rounded-2xl bg-foreground/[0.03] ring-1 ring-white/[0.05] hover:bg-foreground/[0.05] hover:ring-white/[0.10] transition-colors p-3 sm:p-4 flex items-start gap-3 sm:gap-4"
                >
                  {/* Poster */}
                  <Link
                    href={d.type === "tv" ? `/tv/${d.id}` : `/movie/${d.id}`}
                    className="block relative w-[60px] sm:w-[80px] aspect-[2/3] rounded-lg overflow-hidden ring-1 ring-white/10 flex-shrink-0 bg-foreground/[0.04]"
                  >
                    {d.poster_path ? (
                      <Image src={`${POSTER}/w185${d.poster_path}`} alt={d.title} fill sizes="80px" className="object-cover" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-foreground/30">
                        <Film size={20} />
                      </div>
                    )}
                  </Link>

                  {/* Meta */}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={d.type === "tv" ? `/tv/${d.id}` : `/movie/${d.id}`}
                      className="block group-hover:text-primary transition-colors"
                    >
                      <h3 className="text-foreground font-semibold text-[14px] sm:text-[15px] leading-tight line-clamp-2">
                        {d.title}
                      </h3>
                    </Link>
                    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap text-[11px] text-foreground/55">
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-primary/15 text-primary font-bold uppercase">
                        {d.type === "movie" ? <Film size={10} /> : <TvIcon size={10} />}
                        {d.type === "movie" ? "Фильм" : "Сериал"}
                      </span>
                      {d.type === "tv" && d.season != null && d.episode != null && (
                        <span className="text-foreground/65 font-semibold">
                          S{d.season}E{d.episode}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-300 font-semibold ring-1 ring-amber-500/25">
                        {d.quality}
                      </span>
                      <span className="inline-flex items-center gap-1 text-foreground/45">
                        <Calendar size={10} /> {fmtAgo(d.downloadedAt)}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => triggerBrowserDownload(d.url, buildFilename(d))}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-primary/15 ring-1 ring-primary/30 text-primary hover:bg-primary/25 transition-colors text-[12px] font-semibold"
                        title="Ссылки живут ~24 часа — кнопка может перестать работать"
                      >
                        <RefreshCw size={11} /> Скачать снова
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Удалить запись «${d.title}${d.type === "tv" && d.season ? ` S${d.season}E${d.episode}` : ""}» из истории?`))
                            deleteDownload(d.id, d.type, d.season, d.episode, d.quality);
                        }}
                        className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-foreground/[0.05] ring-1 ring-white/[0.06] text-foreground/50 hover:text-red-400 hover:bg-red-400/10 hover:ring-red-400/30 transition-colors"
                        title="Удалить из истории"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {items.length > 0 && (
            <p className="text-[11px] text-foreground/35 leading-snug text-center pt-4">
              История синхронизируется между устройствами под твоим аккаунтом. Ссылки на скачивание подписаны источником
              и действительны ~24 часа — если «Скачать снова» вернёт ошибку, открой фильм/серию заново.
            </p>
          )}
        </div>
      </main>
    </>
  );
}
