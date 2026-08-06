"use client";

import { useEffect, useState } from "react";
import { Navbar } from "@/components/navbar";
import { useAuth } from "@/components/auth-context";
import { getLists, createList, deleteList, type UserList } from "@/lib/lists";
import Link from "next/link";
import Image from "next/image";
import { Plus, Trash2, Share2, Film } from "lucide-react";

const POSTER = "https://sapkeflykino.ru/tmdb-img";

export default function ListsPage() {
  const { user } = useAuth();
  const [lists, setLists] = useState<UserList[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setLists(getLists());
    const refresh = () => setLists(getLists());
    window.addEventListener("lists-changed", refresh);
    return () => window.removeEventListener("lists-changed", refresh);
  }, []);

  const onCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createList(name);
    setNewName("");
    setCreating(false);
  };

  const onShare = async (l: UserList) => {
    const url = `${location.origin}/list/${l.id}`;
    try {
      if (navigator.share) await navigator.share({ title: l.name, text: l.name, url });
      else { await navigator.clipboard?.writeText(url); alert("Ссылка скопирована"); }
    } catch {}
  };

  if (!user) {
    return (
      <>
        <Navbar />
        <main className="min-h-screen bg-background flex items-center justify-center px-4">
          <div className="text-center max-w-md space-y-6">
            <span className="text-5xl">📋</span>
            <h1 className="text-3xl font-bold text-foreground">Войдите чтобы создавать списки</h1>
            <Link href="/" className="inline-block px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold">На главную</Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-bold text-foreground tracking-tight">Мои списки</h1>
            <button
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-1.5 px-4 h-10 rounded-full bg-primary text-primary-foreground font-semibold text-[13px] hover:bg-primary/90 transition-colors"
            >
              <Plus size={15} /> Новый список
            </button>
          </div>

          {creating && (
            <div className="rounded-2xl p-4 bg-foreground/[0.03] ring-1 ring-white/[0.06] flex gap-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && onCreate()}
                placeholder="Название (например, «Топ-10 нуаров»)"
                className="flex-1 bg-background/40 ring-1 ring-white/[0.08] rounded-lg px-3 h-10 text-foreground text-sm outline-none focus:ring-primary/40"
              />
              <button onClick={onCreate} className="px-4 h-10 rounded-lg bg-primary text-primary-foreground text-[13px] font-semibold">Создать</button>
              <button onClick={() => { setCreating(false); setNewName(""); }} className="px-4 h-10 rounded-lg bg-foreground/[0.05] text-foreground/75 text-[13px]">Отмена</button>
            </div>
          )}

          {lists.length === 0 && !creating ? (
            <div className="text-center py-16 text-foreground/45">
              <Film size={32} className="mx-auto mb-2 opacity-30" />
              <p className="text-[14px]">У тебя пока нет списков</p>
              <p className="text-[12px] mt-1">Создай первый и добавляй туда фильмы прямо со страницы фильма</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {lists.map(l => (
                <ListCard key={l.id} list={l} onShare={() => onShare(l)} onDelete={() => deleteList(l.id)} />
              ))}
            </div>
          )}
        </div>
      </main>
    </>
  );
}

function ListCard({ list, onShare, onDelete }: { list: UserList; onShare: () => void; onDelete: () => void }) {
  const posters = list.items.filter(i => i.poster_path).slice(0, 4);
  return (
    <div className="rounded-2xl overflow-hidden bg-foreground/[0.025] ring-1 ring-white/[0.06] hover:ring-primary/30 transition-all group">
      <Link href={`/list/${list.id}`} className="block">
        <div className="relative aspect-[16/9] bg-foreground/[0.04]">
          {posters.length > 0 ? (
            <div className="grid grid-cols-2 grid-rows-2 h-full">
              {posters.map((p, i) => (
                <div key={i} className="relative overflow-hidden">
                  <Image src={`${POSTER}/w342${p.poster_path}`} alt="" fill sizes="200px" className="object-cover brightness-[0.92] transition-[filter] duration-300 group-hover:brightness-110" />
                </div>
              ))}
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-foreground/25">
              <Film size={32} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3">
            <h3 className="text-white font-bold text-[15px] leading-tight">{list.name}</h3>
            <p className="text-white/65 text-[11.5px] mt-0.5">{list.items.length} {list.items.length === 1 ? "фильм" : list.items.length < 5 && list.items.length > 0 ? "фильма" : "фильмов"}</p>
          </div>
        </div>
      </Link>
      <div className="flex items-center justify-end gap-1 px-3 py-2 border-t border-white/[0.04]">
        <button onClick={onShare} className="w-8 h-8 rounded-full bg-foreground/[0.04] hover:bg-foreground/[0.08] text-foreground/65 flex items-center justify-center" title="Поделиться">
          <Share2 size={13} />
        </button>
        <button onClick={onDelete} className="w-8 h-8 rounded-full bg-foreground/[0.04] hover:bg-red-400/15 hover:text-red-300 text-foreground/65 flex items-center justify-center" title="Удалить">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}
