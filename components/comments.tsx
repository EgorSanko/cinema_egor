"use client";

import { getComments, addComment, deleteComment, type Comment } from "@/lib/storage";
import { Star, Send, Trash2, MessageCircle } from "lucide-react";
import { useState, useEffect } from "react";

interface CommentsProps {
  mediaId: number;
  mediaType: "movie" | "tv";
}

export function Comments({ mediaId, mediaType }: CommentsProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [author, setAuthor] = useState("");
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);

  useEffect(() => {
    setComments(getComments(mediaId, mediaType));
    const saved = localStorage.getItem("kino_username");
    if (saved) setAuthor(saved);
  }, [mediaId, mediaType]);

  const handleSubmit = () => {
    if (!text.trim() || !author.trim() || rating === 0) return;
    localStorage.setItem("kino_username", author);
    const newComment = addComment({ mediaId, mediaType, author: author.trim(), text: text.trim(), rating });
    setComments([newComment, ...comments]);
    setText("");
    setRating(0);
  };

  const handleDelete = (id: string) => {
    deleteComment(id);
    setComments(comments.filter(c => c.id !== id));
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

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold text-foreground">Отзывы</h2>
          <span className="text-sm text-muted-foreground bg-card px-2.5 py-1 rounded-lg">{comments.length}</span>
          {avgRating && (
            <span className="text-sm text-yellow-400 flex items-center gap-1">
              <Star size={14} fill="currentColor" /> {avgRating}
            </span>
          )}
        </div>
      </div>

      {/* Add comment form */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-4">
          <input
            type="text"
            placeholder="Ваше имя"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm focus:outline-none focus:border-primary transition-colors"
            maxLength={30}
          />
          {/* Star rating */}
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map(s => (
              <button key={s}
                onMouseEnter={() => setHoverRating(s)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(s)}
                className="p-0.5 transition-transform hover:scale-110">
                <Star size={20}
                  className={`transition-colors ${(hoverRating || rating) >= s ? "text-yellow-400" : "text-gray-600"}`}
                  fill={(hoverRating || rating) >= s ? "currentColor" : "none"}
                />
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-3">
          <textarea
            placeholder="Напишите отзыв..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-foreground placeholder-muted-foreground text-sm resize-none focus:outline-none focus:border-primary transition-colors"
            maxLength={500}
          />
          <button onClick={handleSubmit}
            disabled={!text.trim() || !author.trim() || rating === 0}
            className="self-end px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2">
            <Send size={16} />
          </button>
        </div>
      </div>

      {/* Comments list */}
      {comments.length === 0 ? (
        <div className="text-center py-10">
          <MessageCircle size={40} className="mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Пока нет отзывов. Будьте первым!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-card border border-border rounded-xl p-4 group">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary text-sm font-bold">
                    {c.author.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <span className="text-sm font-medium text-foreground">{c.author}</span>
                    <span className="text-xs text-muted-foreground ml-2">{timeAgo(c.createdAt)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map(s => (
                      <Star key={s} size={12}
                        className={c.rating >= s ? "text-yellow-400" : "text-gray-700"}
                        fill={c.rating >= s ? "currentColor" : "none"}
                      />
                    ))}
                  </div>
                  <button onClick={() => handleDelete(c.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-400 transition-all">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{c.text}</p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
