"use client";

import { Star, Trash2, MessageCircle } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "./auth-context";

interface CommentsProps {
  mediaId: number;
  mediaType: "movie" | "tv";
}

type PublicReview = {
  id: string;
  author: string;
  text: string;
  rating: number;
  createdAt: number;
  updatedAt?: number;
  mine?: boolean;
};

/**
 * Публичные отзывы к тайтлу. Привязаны к карточке TMDB целиком — не к сезону,
 * серии или плееру.
 *
 * Раньше отзывы лежали в localStorage и синхронизировались только в личный
 * профиль, то есть их не видел никто, кроме автора (фича была собрана
 * наполовину). Теперь читаем и пишем через /api/reviews: личность сервер берёт
 * из подписанной куки, поэтому отзыв от чужого имени не оставить.
 *
 * Имя показываем из аккаунта; у кого его нет — «Гость». Почта наружу не уходит
 * никогда (иначе публичный отзыв раскрыл бы её).
 */
export function Comments({ mediaId, mediaType }: CommentsProps) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PublicReview[]>([]);
  const [avg, setAvg] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const authorName = (user?.name?.trim() || "Гость");

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/reviews?id=${mediaId}&type=${mediaType}`, { cache: "no-store" });
      const d = await r.json();
      setReviews(Array.isArray(d.reviews) ? d.reviews : []);
      setAvg(d.avg ?? null);
      // Свой отзыв подставляем в форму — повторная отправка его обновит.
      const mine = (d.reviews || []).find((x: PublicReview) => x.mine);
      if (mine) { setText(mine.text); setRating(mine.rating); }
    } catch { /* сеть отвалилась — покажем пустой список, форма останется рабочей */ }
  }, [mediaId, mediaType]);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!text.trim() || rating === 0 || busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaId, mediaType, text: text.trim(), rating, author: authorName }),
      });
      const d = await r.json();
      if (!r.ok) { setError(d.error === "auth" ? "Войдите в аккаунт, чтобы оставить отзыв." : "Не удалось отправить. Попробуйте ещё раз."); return; }
      await load();
    } catch { setError("Нет связи с сервером. Попробуйте позже."); }
    finally { setBusy(false); }
  };

  const handleDelete = async (id: string) => {
    try {
      await fetch(`/api/reviews?id=${mediaId}&type=${mediaType}&rid=${id}`, { method: "DELETE" });
      setReviews((prev) => prev.filter((x) => x.id !== id));
      setText(""); setRating(0);
      load();
    } catch {}
  };

  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "только что";
    if (mins < 60) return `${mins} мин. назад`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} ч. назад`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days} дн. назад`;
    return new Date(ts).toLocaleDateString("ru-RU");
  };

  const ratingLabel = ["", "плохо", "так себе", "неплохо", "хорошо", "отлично"][rating] || "";
  const alreadyMine = reviews.some((r) => r.mine);

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-2xl font-bold text-foreground">Отзывы</h2>
        {reviews.length > 0 && <span className="text-[13px] text-foreground/60">{reviews.length}</span>}
        {avg != null && (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-amber-300">
            <Star size={13} fill="currentColor" /> {avg}
          </span>
        )}
      </div>

      {user ? (
        <div className="rounded-2xl bg-foreground/[0.04] p-4 sm:p-5">
          {/* Оценка отдельной строкой: в одном ряду с полем ввода пять звёзд
              на телефоне сжимало и выносило за край. Тач-цели 44px. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-[13px] font-medium text-foreground/70">Ваша оценка</span>
            <div className="flex items-center">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-label={`Оценка ${s} из 5`}
                  onMouseEnter={() => setHoverRating(s)}
                  onMouseLeave={() => setHoverRating(0)}
                  onClick={() => setRating(s)}
                  className="shrink-0 grid h-11 w-11 place-items-center -mx-0.5"
                >
                  <Star
                    size={24}
                    className={`transition-colors ${(hoverRating || rating) >= s ? "text-amber-300" : "text-foreground/25"}`}
                    fill={(hoverRating || rating) >= s ? "currentColor" : "none"}
                  />
                </button>
              ))}
            </div>
            {ratingLabel && <span className="text-[13px] text-foreground/60">{ratingLabel}</span>}
          </div>

          <textarea
            placeholder="Что понравилось, а что нет?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="mt-3 w-full rounded-xl bg-background/60 px-3.5 py-3 text-[14px] text-foreground placeholder:text-foreground/40 resize-none outline-none ring-1 ring-white/[0.08] focus:ring-primary/50 transition-shadow"
            maxLength={500}
          />

          {error && <p className="mt-2 text-[13px] text-red-400">{error}</p>}

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-foreground/50">
              {text.length > 0 ? `${text.length} / 500` : `Отзыв увидят все · подпись: ${authorName}`}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || rating === 0 || busy}
              className="h-10 px-5 rounded-full bg-primary text-[#0a0a0b] text-[13px] font-bold disabled:opacity-35 disabled:cursor-not-allowed hover:brightness-110 transition-[filter,opacity]"
            >
              {busy ? "Отправляем…" : alreadyMine ? "Обновить" : "Отправить"}
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-foreground/[0.04] p-5 text-[14px] text-foreground/70">
          Войдите в аккаунт, чтобы оставить отзыв — его увидят другие зрители.
        </div>
      )}

      {reviews.length === 0 ? (
        <div className="py-8 text-center">
          <MessageCircle size={32} className="mx-auto mb-2.5 text-foreground/20" />
          <p className="text-[14px] text-foreground/55">Отзывов пока нет — ваш будет первым</p>
        </div>
      ) : (
        <div>
          {reviews.map((c) => (
            <article key={c.id} className="group flex gap-3.5 border-t border-white/[0.07] py-4">
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">
                {(c.author || "Г").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-[13.5px] font-semibold text-foreground">{c.author}</span>
                  {c.mine && (
                    <span className="rounded-md bg-primary/15 px-1.5 py-0.5 text-[11px] font-bold text-primary">ваш</span>
                  )}
                  <span className="text-[12.5px] text-foreground/50">{timeAgo(c.updatedAt || c.createdAt)}</span>
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star
                        key={s}
                        size={13}
                        className={c.rating >= s ? "text-amber-300" : "text-foreground/20"}
                        fill={c.rating >= s ? "currentColor" : "none"}
                      />
                    ))}
                  </span>
                </div>
                <p className="mt-1.5 text-[14px] leading-relaxed text-foreground/80 break-words">{c.text}</p>
              </div>
              {/* Удалять может автор (и админ — это решает сервер). На телефоне
                  навести нельзя, поэтому кнопка видна всегда. */}
              {c.mine && (
                <button
                  onClick={() => handleDelete(c.id)}
                  aria-label="Удалить отзыв"
                  className="h-9 w-9 shrink-0 grid place-items-center rounded-full text-foreground/40 opacity-60 hover:bg-white/[0.06] hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                >
                  <Trash2 size={15} />
                </button>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
