"use client";

import { getComments, addComment, deleteComment, type Comment } from "@/lib/storage";
import { Star, Trash2, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "./auth-context";

interface CommentsProps {
  mediaId: number;
  mediaType: "movie" | "tv";
}

/**
 * Отзывы к тайтлу. Хранятся в аккаунте пользователя (kino_comments в профиле,
 * синк через /api/sync) — то есть это ЛИЧНЫЕ заметки с оценкой, их не видит
 * никто другой.
 *
 * Переделано после отзыва Егора:
 *  - убрано поле «Ваше имя»: отзыв и так идёт от аккаунта, имя берём оттуда;
 *  - оценка вынесена в отдельную строку — раньше пять звёзд стояли в один ряд
 *    с полем ввода и на телефоне не помещались, их сжимало и выносило за край;
 *  - звёзды получили полноразмерные тач-цели (44px) и не сжимаются;
 *  - кнопка удаления была видна ТОЛЬКО при наведении — на телефоне навести
 *    нельзя, то есть удалить свой отзыв с телефона было невозможно;
 *  - вместо «карточек в рамке» — разделители-волоски, как в остальном свежем
 *    оформлении.
 */
export function Comments({ mediaId, mediaType }: CommentsProps) {
  const { user } = useAuth();
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  // Имя для подписи отзыва: имя аккаунта → почта → «Я». Спрашивать его у
  // пользователя не нужно, оно уже известно.
  const authorName = (user?.name?.trim() || user?.email?.trim() || "Я");

  useEffect(() => {
    setComments(getComments(mediaId, mediaType));
  }, [mediaId, mediaType]);

  const handleSubmit = () => {
    if (!text.trim() || rating === 0) return;
    const newComment = addComment({ mediaId, mediaType, author: authorName, text: text.trim(), rating });
    setComments([newComment, ...comments]);
    setText("");
    setRating(0);
  };

  const handleDelete = (id: string) => {
    deleteComment(id);
    setComments(comments.filter((c) => c.id !== id));
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

  const avgRating = comments.length > 0
    ? (comments.reduce((sum, c) => sum + c.rating, 0) / comments.length).toFixed(1)
    : null;

  const ratingLabel = ["", "плохо", "так себе", "неплохо", "хорошо", "отлично"][rating] || "";

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-2xl font-bold text-foreground">Отзывы</h2>
        {comments.length > 0 && (
          <span className="text-[13px] text-foreground/60">{comments.length}</span>
        )}
        {avgRating && (
          <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-amber-300">
            <Star size={13} fill="currentColor" /> {avgRating}
          </span>
        )}
      </div>

      {/* ── Форма ──────────────────────────────────────────────────────── */}
      {user ? (
        <div className="rounded-2xl bg-foreground/[0.04] p-4 sm:p-5">
          {/* Оценка — ОТДЕЛЬНОЙ строкой. Раньше звёзды делили ряд с полем имени
              и на узком экране их сжимало за край картинки. */}
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
            {ratingLabel && (
              <span className="text-[13px] text-foreground/60">{ratingLabel}</span>
            )}
          </div>

          <textarea
            placeholder="Что понравилось, а что нет?"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            className="mt-3 w-full rounded-xl bg-background/60 px-3.5 py-3 text-[14px] text-foreground placeholder:text-foreground/40 resize-none outline-none ring-1 ring-white/[0.08] focus:ring-primary/50 transition-shadow"
            maxLength={500}
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-foreground/50">
              {text.length > 0 ? `${text.length} / 500` : "Виден только вам"}
            </span>
            <button
              onClick={handleSubmit}
              disabled={!text.trim() || rating === 0}
              className="h-10 px-5 rounded-full bg-primary text-[#0a0a0b] text-[13px] font-bold disabled:opacity-35 disabled:cursor-not-allowed hover:brightness-110 transition-[filter,opacity]"
            >
              Отправить
            </button>
          </div>
        </div>
      ) : (
        <div className="rounded-2xl bg-foreground/[0.04] p-5 text-[14px] text-foreground/70">
          Войдите в аккаунт, чтобы оставлять отзывы — они сохранятся и будут
          доступны на всех ваших устройствах.
        </div>
      )}

      {/* ── Список ─────────────────────────────────────────────────────── */}
      {comments.length === 0 ? (
        <div className="py-8 text-center">
          <MessageCircle size={32} className="mx-auto mb-2.5 text-foreground/20" />
          <p className="text-[14px] text-foreground/55">
            Здесь появятся ваши отзывы об этом тайтле
          </p>
        </div>
      ) : (
        <div>
          {comments.map((c) => (
            <article key={c.id} className="group flex gap-3.5 border-t border-white/[0.07] py-4">
              <div className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-[13px] font-bold text-primary">
                {(c.author || "Я").charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="text-[13.5px] font-semibold text-foreground">{c.author}</span>
                  <span className="text-[12.5px] text-foreground/50">{timeAgo(c.createdAt)}</span>
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
              {/* Удаление: на телефоне навести нельзя, поэтому кнопка видна всегда
                  (приглушённо), а на десктопе проявляется при наведении. */}
              <button
                onClick={() => handleDelete(c.id)}
                aria-label="Удалить отзыв"
                className="h-9 w-9 shrink-0 grid place-items-center rounded-full text-foreground/40 opacity-60 hover:bg-white/[0.06] hover:text-red-400 sm:opacity-0 sm:group-hover:opacity-100 transition-all"
              >
                <Trash2 size={15} />
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
