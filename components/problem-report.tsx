"use client";

// «Сообщить о проблеме» — компактная кнопка под плеером на всех страницах.
// Создаёт тикет (category:"bug") через существующий /api/tickets с указанием
// фильма/серии и текущего плеера-источника, чтобы админ в списке тикетов сразу
// видел, ЧТО и ГДЕ не работает. Модалка порталится в body (iOS: fixed внутри
// скроллера-плеера иначе ломается).

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X, Check } from "lucide-react";
import { getSource } from "@/lib/kinopub";

const ISSUES = [
  "Не воспроизводится",
  "Не тот фильм / серия",
  "Нет звука",
  "Плохое качество",
  "Не та озвучка / перевод",
  "Зависает / тормозит",
  "Нет нужной озвучки",
  "Другое",
];

const SRC_LABEL: Record<string, string> = {
  alloha: "Плеер 1 (Alloha)",
  kinopub: "Плеер 2 (kino.pub)",
  hdrezka: "HDRezka",
  zenithjs: "Free (zenithjs)",
};

interface Props {
  mediaType: "movie" | "tv";
  mediaId: number;
  title: string;
  season?: number;
  episode?: number;
}

export function ProblemReport({ mediaType, mediaId, title, season, episode }: Props) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  // Закрытие по Esc + блокировка скролла фона, пока открыта модалка.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [open]);

  const reset = () => { setIssue(null); setComment(""); setDone(false); setSending(false); };

  const submit = async () => {
    if (!issue || sending) return;
    setSending(true);
    let email = "guest@sapkeflykino.ru";
    let src = "";
    try { email = JSON.parse(localStorage.getItem("user") || "null")?.email || email; } catch {}
    try { src = getSource(); } catch {}
    const where = mediaType === "tv" && season ? ` S${season}E${episode || 1}` : "";
    const srcTxt = SRC_LABEL[src] || src || "неизвестен";
    const subject = `Проблема · ${title}${where}`;
    const message =
      `${issue}\n` +
      `Плеер: ${srcTxt}\n` +
      `Контент: ${mediaType}/${mediaId}${where} — ${title}\n` +
      (comment.trim() ? `Комментарий: ${comment.trim()}\n` : "") +
      `URL: ${typeof location !== "undefined" ? location.href : ""}`;
    try {
      await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email, category: "bug", subject, message,
          meta: {
            platform: "web",
            currentScreen: typeof location !== "undefined" ? location.pathname : "",
            userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
          },
        }),
      });
      setDone(true);
      setTimeout(() => { setOpen(false); reset(); }, 1600);
    } catch {
      setSending(false);
    }
  };

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-foreground/45 hover:text-foreground/80 transition-colors"
      >
        <AlertTriangle size={14} className="opacity-80" />
        Сообщить о проблеме
      </button>

      {mounted && open && createPortal(
        <div
          className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full sm:max-w-md bg-[#15151c] border border-white/10 rounded-t-2xl sm:rounded-2xl shadow-2xl shadow-black/60 p-5 sm:p-6"
            onClick={e => e.stopPropagation()}
          >
            {done ? (
              <div className="py-8 flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <Check size={30} className="text-emerald-400" />
                </div>
                <p className="text-foreground font-semibold text-[15px]">Спасибо! Передали.</p>
                <p className="text-foreground/50 text-[13px]">Разберёмся с проблемой.</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-1">
                  <h3 className="text-foreground font-bold text-[16px]">Что не так с просмотром?</h3>
                  <button onClick={() => setOpen(false)} className="text-foreground/40 hover:text-foreground/80 -mt-0.5 -mr-1 p-1">
                    <X size={18} />
                  </button>
                </div>
                <p className="text-foreground/50 text-[12.5px] mb-4 line-clamp-1">{title}</p>

                <div className="flex flex-wrap gap-2 mb-4">
                  {ISSUES.map(x => (
                    <button
                      key={x}
                      onClick={() => setIssue(x)}
                      className={"px-3 py-2 rounded-xl text-[13px] font-medium border transition-colors " + (issue === x
                        ? "bg-primary/15 border-primary/50 text-foreground"
                        : "bg-white/[0.03] border-white/10 text-foreground/70 hover:border-white/20 hover:text-foreground/90")}
                    >
                      {x}
                    </button>
                  ))}
                </div>

                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Комментарий (необязательно)"
                  rows={2}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3.5 py-2.5 text-[14px] text-foreground placeholder:text-foreground/35 outline-none focus:border-primary/50 transition-colors resize-none mb-4"
                />

                <button
                  onClick={submit}
                  disabled={!issue || sending}
                  className="w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {sending ? "Отправляем…" : "Отправить"}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
