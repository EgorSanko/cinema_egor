"use client";

import { useEffect, useState, use, useCallback } from "react";
import { Navbar } from "@/components/navbar";
import { getLists, addToList, removeFromList, saveLists, type UserList, type ListItem } from "@/lib/lists";
import Link from "next/link";
import Image from "next/image";
import { Film, ArrowLeft, Plus, X, Search, Share2, Download, Trash2 } from "lucide-react";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

export default function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [list, setList] = useState<UserList | null>(null);
  const [isOwn, setIsOwn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const refresh = useCallback(() => {
    if (typeof window === "undefined") return;
    const own = getLists().find(x => x.id === id);
    if (own) {
      setList(own);
      setIsOwn(true);
      setLoading(false);
      return;
    }
    // Public lookup — friend's list
    fetch("/api/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list-lookup", listId: id }),
    })
      .then(r => r.json())
      .then(j => {
        if (j.success && j.data) { setList(j.data); setIsOwn(false); }
        else setNotFound(true);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    refresh();
    window.addEventListener("lists-changed", refresh);
    return () => window.removeEventListener("lists-changed", refresh);
  }, [refresh]);

  const onShare = async () => {
    if (!list) return;
    const url = `${location.origin}/list/${list.id}`;
    try {
      if (navigator.share) await navigator.share({ title: list.name, text: list.name, url });
      else { await navigator.clipboard?.writeText(url); alert("Ссылка скопирована"); }
    } catch {}
  };

  const onSaveToMyLists = () => {
    if (!list || isOwn) return;
    const own = getLists();
    if (own.find(l => l.id === list.id)) {
      alert("Список уже у тебя");
      return;
    }
    const copy: UserList = { ...list, updatedAt: Date.now() };
    saveLists([copy, ...own]);
    setIsOwn(true);
    alert("Список сохранён в твои подборки!");
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center">
          <p className="text-foreground/55 text-sm">Загружаю…</p>
        </main>
      </>
    );
  }
  if (notFound) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <span className="text-5xl">🤷</span>
            <h1 className="text-3xl font-bold text-foreground">Список не найден</h1>
            <Link href="/lists" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold">К моим спискам</Link>
          </div>
        </main>
      </>
    );
  }
  if (!list) return null;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10">
          <Link href="/lists" className="inline-flex items-center gap-1.5 text-foreground/55 hover:text-primary text-[13px] font-medium mb-6">
            <ArrowLeft size={14} /> Все списки
          </Link>

          <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tight">{list.name}</h1>
              {list.description && <p className="text-foreground/55 text-sm mt-2">{list.description}</p>}
              <p className="text-foreground/45 text-[12px] mt-2">{list.items.length} {plural(list.items.length, "фильм", "фильма", "фильмов")}{!isOwn && <span className="ml-2 px-2 py-0.5 rounded bg-purple-500/15 ring-1 ring-purple-400/30 text-purple-300 text-[12px] font-bold uppercase tracking-wider">от друга</span>}</p>
            </div>
            <div className="flex items-center gap-2">
              {isOwn && (
                <button
                  onClick={() => setPickerOpen(true)}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground font-semibold text-[13px] hover:bg-primary/90 transition-colors"
                  style={{ boxShadow: "0 6px 20px -4px rgba(163,230,53,0.5)" }}
                >
                  <Plus size={15} /> Добавить
                </button>
              )}
              {!isOwn && (
                <button
                  onClick={onSaveToMyLists}
                  className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground font-semibold text-[13px] hover:bg-primary/90 transition-colors"
                  style={{ boxShadow: "0 6px 20px -4px rgba(163,230,53,0.5)" }}
                >
                  <Download size={15} /> Сохранить себе
                </button>
              )}
              <button
                onClick={onShare}
                className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] ring-1 ring-white/[0.08] text-foreground/75"
                title="Поделиться"
              >
                <Share2 size={15} />
              </button>
            </div>
          </header>

          {list.items.length === 0 ? (
            <div className="text-center py-16 text-foreground/45">
              <Film size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-[14px]">Список пустой</p>
              {isOwn && <p className="text-[12px] mt-1">Жми «Добавить» чтобы найти фильмы через поиск</p>}
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {list.items.map(it => (
                <div key={`${it.type}-${it.id}`} className="group relative">
                  <Link href={it.type === "tv" ? `/tv/${it.id}` : `/movie/${it.id}`} className="block">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/40 transition-all">
                      {it.poster_path ? (
                        <Image src={`${POSTER}/w342${it.poster_path}`} alt={it.title} fill sizes="200px" className="object-cover transition-transform group-hover:scale-105" />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center text-foreground/30"><Film size={28} /></div>
                      )}
                    </div>
                    <p className="mt-2 text-foreground/85 text-[12.5px] font-semibold line-clamp-1 group-hover:text-primary">{it.title}</p>
                  </Link>
                  {isOwn && (
                    <button
                      onClick={() => { removeFromList(list.id, it.id, it.type); }}
                      title="Убрать"
                      className="absolute top-1.5 right-1.5 w-7 h-7 rounded-full bg-black/70 backdrop-blur ring-1 ring-white/15 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-red-500/80"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {pickerOpen && isOwn && (
        <SearchPicker
          existing={list.items}
          onClose={() => setPickerOpen(false)}
          onPick={(item) => { addToList(list.id, item); }}
        />
      )}
    </>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const n10 = n % 10, n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return few;
  return many;
}

/* ── Search modal for adding movies/TV to a list ───────────────── */
function SearchPicker({ existing, onClose, onPick }: { existing: ListItem[]; onClose: () => void; onPick: (i: ListItem) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const id = setTimeout(async () => {
      setLoading(true);
      try {
        // multi-search hits both movies and TV in one call
        const res = await fetch(`/tmdb-api/search/multi?api_key=275c9d09780aadb4b13ff57a731eda00&language=ru-RU&query=${encodeURIComponent(q.trim())}`);
        const data = await res.json();
        setResults((data.results || []).filter((r: any) => (r.media_type === "movie" || r.media_type === "tv") && r.poster_path).slice(0, 20));
      } catch {} finally { setLoading(false); }
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  const existingKeys = new Set(existing.map(i => `${i.type}-${i.id}`));

  const handlePick = (r: any) => {
    const item: ListItem = {
      id: r.id,
      type: r.media_type === "tv" ? "tv" : "movie",
      title: r.title || r.name,
      poster_path: r.poster_path || null,
    };
    onPick(item);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-4 bg-black/75 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-2xl max-h-[85vh] mt-12 sm:mt-0 rounded-2xl bg-background ring-1 ring-white/10 flex flex-col">
        <div className="p-4 border-b border-white/[0.06] flex items-center gap-3">
          <Search size={18} className="text-foreground/55 flex-shrink-0" />
          <input
            autoFocus
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Найди фильм или сериал…"
            className="flex-1 bg-transparent outline-none text-foreground text-[15px] placeholder:text-foreground/35"
          />
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 flex items-center justify-center" aria-label="Закрыть">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {loading && <p className="text-center py-8 text-foreground/55 text-[13px]">Ищу…</p>}
          {!loading && q.trim().length < 2 && (
            <p className="text-center py-8 text-foreground/45 text-[13px]">Начни вводить название</p>
          )}
          {!loading && q.trim().length >= 2 && results.length === 0 && (
            <p className="text-center py-8 text-foreground/45 text-[13px]">Ничего не нашёл</p>
          )}
          {results.length > 0 && (
            <ul className="divide-y divide-white/[0.05]">
              {results.map(r => {
                const k = `${r.media_type === "tv" ? "tv" : "movie"}-${r.id}`;
                const inList = existingKeys.has(k);
                return (
                  <li key={k} className="flex items-center gap-3 py-2.5">
                    <div className="relative w-10 h-14 rounded-md overflow-hidden bg-foreground/[0.05] flex-shrink-0">
                      {r.poster_path && (
                        <Image src={`${POSTER}/w185${r.poster_path}`} alt={r.title || r.name} fill sizes="40px" className="object-cover" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-foreground text-[13.5px] font-semibold line-clamp-1">{r.title || r.name}</p>
                      <div className="flex items-center gap-2 text-[11px] text-foreground/55 mt-0.5">
                        <span className="px-1.5 py-0.5 rounded bg-foreground/[0.05] text-foreground/70">{r.media_type === "tv" ? "Сериал" : "Фильм"}</span>
                        {(r.release_date || r.first_air_date) && (
                          <span>{new Date(r.release_date || r.first_air_date).getFullYear()}</span>
                        )}
                        {r.vote_average > 0 && <span className="text-amber-300 font-bold">★ {r.vote_average.toFixed(1)}</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handlePick(r)}
                      disabled={inList}
                      className={`flex-shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-full text-[12px] font-bold transition-all ${
                        inList
                          ? "bg-primary/15 text-primary cursor-not-allowed"
                          : "bg-primary text-primary-foreground hover:scale-105"
                      }`}
                      title={inList ? "Уже в списке" : "Добавить"}
                    >
                      {inList ? "✓" : <Plus size={16} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
