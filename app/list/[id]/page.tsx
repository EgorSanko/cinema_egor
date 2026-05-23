"use client";

import { useEffect, useState, use } from "react";
import { Navbar } from "@/components/navbar";
import { getLists, type UserList } from "@/lib/lists";
import Link from "next/link";
import Image from "next/image";
import { Film, ArrowLeft } from "lucide-react";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

export default function ListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [list, setList] = useState<UserList | null>(null);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const lists = getLists();
    const l = lists.find(x => x.id === id);
    if (l) setList(l);
    else setNotFound(true);
  }, [id]);

  if (notFound) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <span className="text-5xl">🤷</span>
            <h1 className="text-3xl font-bold text-foreground">Список не найден</h1>
            <p className="text-foreground/55">Возможно, его удалили — или ссылка от другого пользователя (списки сейчас локальные)</p>
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
          <header className="mb-8">
            <h1 className="text-4xl sm:text-5xl font-black text-foreground tracking-tight">{list.name}</h1>
            {list.description && <p className="text-foreground/55 text-sm mt-2">{list.description}</p>}
            <p className="text-foreground/45 text-[12px] mt-2">{list.items.length} {list.items.length === 1 ? "фильм" : list.items.length < 5 && list.items.length > 0 ? "фильма" : "фильмов"}</p>
          </header>

          {list.items.length === 0 ? (
            <div className="text-center py-16 text-foreground/45">
              <Film size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-[14px]">Список пустой</p>
              <p className="text-[12px] mt-1">Добавляй фильмы со страницы фильма через кнопку «+ в список»</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {list.items.map(it => (
                <Link key={`${it.type}-${it.id}`} href={it.type === "tv" ? `/tv/${it.id}` : `/movie/${it.id}`} className="group block">
                  <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-foreground/[0.04] ring-1 ring-white/[0.06] group-hover:ring-primary/40 transition-all">
                    {it.poster_path ? (
                      <Image src={`${POSTER}/w342${it.poster_path}`} alt={it.title} fill sizes="200px" className="object-cover transition-transform group-hover:scale-105" />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-foreground/30"><Film size={28} /></div>
                    )}
                  </div>
                  <p className="mt-2 text-foreground/85 text-[12.5px] font-semibold line-clamp-1 group-hover:text-primary">{it.title}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
