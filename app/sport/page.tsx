"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ArtPlayerView } from "@/components/art-player";
import { fetchChannels, type SportChannel } from "@/lib/kinopub";
import { useSubscription } from "@/hooks/use-subscription";
import { Radio, Tv, ArrowRight } from "lucide-react";

export default function SportPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [channels, setChannels] = useState<SportChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SportChannel | null>(null);

  const { isPro, loading: subLoading } = useSubscription();
  useEffect(() => {
    // Спорт — фича Про (каналы kino.pub тянутся через gated /kp/ по Pro-куке).
    // От ВЫБРАННОГО плеера (alloha/hdrezka) НЕ зависит — только от подписки.
    if (subLoading) return;
    setEnabled(isPro);
    if (!isPro) { setLoading(false); return; }
    (async () => {
      const list = await fetchChannels();
      setChannels(list);
      setSelected(list[0] || null);
      setLoading(false);
    })();
  }, [isPro, subLoading]);

  return (
    <>
      <Navbar />
      <main className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center">
            <Radio size={22} className="text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Спорт — прямой эфир</h1>
            <p className="text-sm text-muted-foreground">Живые спортивные каналы</p>
          </div>
        </div>

        {enabled === false ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center max-w-xl mx-auto mt-10">
            <Tv size={40} className="text-muted-foreground mx-auto mb-4" />
            <p className="text-foreground font-semibold mb-2">Спорт — по подписке Про</p>
            <p className="text-sm text-muted-foreground mb-5">
              Прямой эфир спортивных каналов доступен подписчикам Про.
            </p>
            <Link href="/pro" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground font-semibold">
              Оформить Про <ArrowRight size={16} />
            </Link>
          </div>
        ) : loading ? (
          <div className="flex justify-center py-20">
            <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          </div>
        ) : channels.length === 0 ? (
          <p className="text-muted-foreground text-center py-20">Каналы временно недоступны. Попробуйте позже.</p>
        ) : (
          <>
            {/* Плеер выбранного канала */}
            {selected && (
              <div className="mb-6">
                <ArtPlayerView
                  key={selected.id}
                  streamUrl={selected.stream}
                  kinopubMode
                  autoStart
                  interactive
                  poster={selected.logo || undefined}
                />
                <div className="flex items-center gap-3 mt-3">
                  {selected.logo && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={selected.logo} alt="" className="w-9 h-9 rounded object-contain bg-black/20"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  )}
                  <div>
                    <p className="font-semibold text-foreground flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" /> {selected.title || selected.name}
                    </p>
                    <p className="text-xs text-muted-foreground">Прямой эфир</p>
                  </div>
                </div>
              </div>
            )}

            {/* Сетка каналов */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
              {channels.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelected(c); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                  className={
                    "group flex flex-col items-center gap-2 rounded-xl p-3 border transition-colors " +
                    (selected?.id === c.id ? "border-primary bg-primary/10" : "border-border bg-card hover:border-muted-foreground/40")
                  }
                >
                  <div className="w-full aspect-video rounded-lg bg-black/30 flex items-center justify-center overflow-hidden">
                    {c.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.logo} alt={c.title} className="max-w-[80%] max-h-[80%] object-contain"
                        onError={(e) => { const t = e.currentTarget as HTMLImageElement; t.style.display = "none"; (t.nextElementSibling as HTMLElement)?.classList.remove("hidden"); }} />
                    ) : null}
                    <span className={"text-xs text-center text-muted-foreground px-1 " + (c.logo ? "hidden" : "")}>{c.title || c.name}</span>
                  </div>
                  <span className="text-[11px] text-center text-foreground/80 line-clamp-1 w-full">{c.title || c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
    </>
  );
}
