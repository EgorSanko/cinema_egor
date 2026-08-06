"use client";

import { useEffect, useState } from "react";

// Отзывы с Кинопоиска (через наш бэкенд /api/kpreviews, токен спрятан + кэш 30д).
interface Review { type?: string; author?: string; title?: string; review?: string; date?: string; }

const TYPE_STYLE: Record<string, string> = {
  "Позитивный": "bg-green-500/15 text-green-400",
  "Негативный": "bg-red-500/15 text-red-400",
  "Нейтральный": "bg-amber-500/15 text-amber-300",
};

export function KpReviews({ tmdbId, type = "movie" }: { tmdbId: number; type?: "movie" | "tv" }) {
  const [data, setData] = useState<{ total: number; reviews: Review[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [show, setShow] = useState(6);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`https://kino.lead-seek.ru/hdrezka/api/kpreviews?tmdb=${tmdbId}&type=${type}&limit=20`)
      .then((r) => r.json())
      .then((d) => { if (alive) { setData(d); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [tmdbId, type]);

  if (loading || !data || !data.reviews || data.reviews.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold mb-4 flex items-center gap-2 text-foreground">
        Отзывы
        <span className="text-[13px] text-muted-foreground font-normal">с Кинопоиска · {data.total}</span>
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {data.reviews.slice(0, show).map((r, i) => {
          const long = (r.review || "").length > 320;
          const open = expanded === i;
          return (
            <div key={i} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="flex items-center gap-2 mb-2">
                {r.type && (
                  <span className={"text-[12px] font-bold px-1.5 py-0.5 rounded " + (TYPE_STYLE[r.type] || "bg-white/10 text-muted-foreground")}>
                    {r.type}
                  </span>
                )}
                <span className="text-[13px] font-semibold text-foreground/90 truncate">{r.author || "Аноним"}</span>
              </div>
              {r.title && <div className="text-[13.5px] font-semibold mb-1 text-foreground/90">{r.title}</div>}
              <p className={"text-[13px] leading-relaxed text-muted-foreground whitespace-pre-line " + (open ? "" : "line-clamp-6")}>
                {r.review}
              </p>
              {long && (
                <button onClick={() => setExpanded(open ? null : i)} className="mt-1.5 text-[12px] text-primary hover:underline">
                  {open ? "Свернуть" : "Читать полностью"}
                </button>
              )}
            </div>
          );
        })}
      </div>
      {show < data.reviews.length && (
        <div className="mt-4 text-center">
          <button onClick={() => setShow((s) => s + 6)} className="px-5 h-10 rounded-full text-[13px] font-semibold border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition">
            Показать ещё отзывы
          </button>
        </div>
      )}
    </section>
  );
}
