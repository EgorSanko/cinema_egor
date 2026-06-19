"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface UserShape { email?: string; name?: string }

const CATEGORIES = [
  { value: "bug",      label: "🐛 Ошибка / баг" },
  { value: "feature",  label: "💡 Предложить улучшение" },
  { value: "question", label: "❓ Вопрос" },
  { value: "other",    label: "📝 Другое" },
] as const;

const STATUS: Record<string, { label: string; cls: string }> = {
  open:        { label: "Открыта",  cls: "bg-blue-500/15 text-blue-300 ring-blue-500/30" },
  in_progress: { label: "В работе", cls: "bg-amber-500/15 text-amber-300 ring-amber-500/30" },
  resolved:    { label: "Решена",   cls: "bg-green-500/15 text-green-300 ring-green-500/30" },
  closed:      { label: "Закрыта",  cls: "bg-white/10 text-white/60 ring-white/20" },
};

/**
 * User-facing support form. Saved tickets are read by admin at /admin/tickets.
 *
 * We require login before the form is visible — it's the simplest spam guard
 * (login already requires an email round-trip) and it gives us an identity
 * to attach to every ticket without making the user type their email twice.
 */
export default function SupportPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserShape | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [category, setCategory] = useState<"bug" | "feature" | "question" | "other">("bug");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [screenshot, setScreenshot] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"new" | "mine">("new");
  const [myTickets, setMyTickets] = useState<any[] | null>(null);
  const [loadingMine, setLoadingMine] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setAuthChecked(true);
  }, []);

  async function loadMine(em: string) {
    setLoadingMine(true);
    try {
      const res = await fetch(`/api/tickets?mine=1&email=${encodeURIComponent(em)}`);
      const data = await res.json();
      setMyTickets(res.ok ? (data.tickets || []) : []);
    } catch { setMyTickets([]); }
    finally { setLoadingMine(false); }
  }

  useEffect(() => {
    if (tab === "mine" && user?.email) loadMine(user.email);
  }, [tab, user]);

  function handleScreenshotPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setError("Скриншот больше 5 МБ. Сожми перед отправкой.");
      return;
    }
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(f.type)) {
      setError("Только JPG, PNG или WebP.");
      return;
    }
    setError(null);
    setScreenshot(f);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.email) {
      setError("Войди, чтобы отправить заявку.");
      return;
    }
    if (message.trim().length < 5) {
      setError("Опиши проблему подробнее — минимум 5 символов.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    const fd = new FormData();
    fd.append("email", user.email);
    fd.append("category", category);
    fd.append("subject", subject);
    fd.append("message", message);
    fd.append("meta", JSON.stringify({
      platform: "web",
      userAgent: navigator.userAgent,
      currentScreen: document.referrer ? new URL(document.referrer).pathname : "/support",
      appVersion: "web",
    }));
    if (screenshot) fd.append("screenshot", screenshot);

    try {
      const res = await fetch("/api/tickets", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Не удалось отправить");
        setSubmitting(false);
        return;
      }
      setSuccess(`Заявка #${data.id.slice(0, 8)} принята. Ответ появится во вкладке «Мои заявки».`);
      if (user?.email) loadMine(user.email);
      setSubject("");
      setMessage("");
      setScreenshot(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: any) {
      setError(err?.message || "Сетевая ошибка");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-white/50">Загрузка...</div>;
  }

  if (!user?.email) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center bg-white/[0.04] rounded-2xl p-8">
          <h1 className="text-xl font-bold mb-2">Поддержка</h1>
          <p className="text-white/60 mb-6">Войди в аккаунт, чтобы отправить заявку.</p>
          <button
            onClick={() => router.push("/profile")}
            className="px-6 py-3 rounded-lg bg-red-500 hover:bg-red-600 transition-colors font-semibold"
          >
            Войти
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 max-w-2xl mx-auto">
      <button onClick={() => router.back()} className="text-white/50 text-sm mb-4 hover:text-white">
        ← Назад
      </button>

      <h1 className="text-2xl font-bold mb-2">Поддержка</h1>
      <p className="text-white/60 text-sm mb-6">
        Опиши проблему или предложение. Прочитаем и ответим — ответ придёт во вкладку «Мои заявки».
      </p>

      {/* Tabs: new ticket / my tickets */}
      <div className="flex gap-1 mb-6 p-1 bg-white/[0.04] rounded-xl w-fit">
        {([["new", "Новая заявка"], ["mine", "Мои заявки"]] as const).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t ? "bg-white/[0.1] text-white" : "text-white/50 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "mine" ? (
        <div className="space-y-3">
          {loadingMine && <p className="text-white/50 text-sm">Загрузка…</p>}
          {!loadingMine && myTickets && myTickets.length === 0 && (
            <div className="text-center py-12 text-white/50">
              <p>У тебя пока нет заявок.</p>
              <button onClick={() => setTab("new")} className="mt-3 text-sm text-white/70 hover:text-white underline">
                Создать первую
              </button>
            </div>
          )}
          {!loadingMine && myTickets && myTickets.map((t) => {
            const st = STATUS[t.status] || STATUS.open;
            return (
              <div key={t.id} className="bg-white/[0.04] rounded-2xl p-4 ring-1 ring-white/[0.06]">
                <div className="flex items-start justify-between gap-3">
                  <h3 className="font-semibold text-white text-[15px] min-w-0 break-words">{t.subject || "Без темы"}</h3>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded-full text-[11px] font-semibold ring-1 ${st.cls}`}>{st.label}</span>
                </div>
                <p className="text-white/40 text-[11px] mt-0.5">
                  #{String(t.id).slice(0, 8)} · {new Date(t.createdAt).toLocaleDateString("ru-RU")}
                </p>
                <p className="text-white/70 text-[13px] mt-2 whitespace-pre-line break-words">{t.message}</p>
                {t.reply && (
                  <div className="mt-3 rounded-xl bg-green-500/[0.07] ring-1 ring-green-500/20 p-3">
                    <p className="text-green-300/90 text-[11px] font-semibold uppercase tracking-wider mb-1">Ответ поддержки</p>
                    <p className="text-white/85 text-[13px] whitespace-pre-line break-words">{t.reply}</p>
                    {t.repliedAt && (
                      <p className="text-white/40 text-[11px] mt-1.5">{new Date(t.repliedAt).toLocaleDateString("ru-RU")}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">Тип</label>
          <div className="grid grid-cols-2 gap-2 mt-1">
            {CATEGORIES.map(c => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  category === c.value
                    ? "bg-red-500 text-white"
                    : "bg-white/[0.06] text-white/70 hover:bg-white/[0.1]"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">Тема (необязательно)</label>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            maxLength={200}
            placeholder="Кратко: что не работает"
            className="w-full mt-1 px-3 py-2.5 rounded-lg bg-white/[0.06] text-white placeholder-white/30 focus:outline-none focus:bg-white/[0.1]"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">
            Сообщение <span className="text-white/30">({message.length}/4000)</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={4000}
            rows={8}
            placeholder="Опиши подробно: что хотел сделать, что произошло, на каком фильме/сериале (если применимо)..."
            className="w-full mt-1 px-3 py-2.5 rounded-lg bg-white/[0.06] text-white placeholder-white/30 focus:outline-none focus:bg-white/[0.1] resize-y"
          />
        </div>

        <div>
          <label className="text-[11px] uppercase tracking-wider text-white/45 font-semibold">
            Скриншот (необязательно, до 5 МБ)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleScreenshotPick}
            className="block mt-1 text-sm text-white/70 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-white/[0.1] file:text-white hover:file:bg-white/[0.15] file:cursor-pointer"
          />
          {screenshot && (
            <div className="mt-2 flex items-center gap-2 text-sm text-white/60">
              <span>📎 {screenshot.name}</span>
              <button
                type="button"
                onClick={() => {
                  setScreenshot(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-red-400 hover:text-red-300"
              >
                Убрать
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-300 px-3 py-2 rounded-lg text-sm">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-300 px-3 py-2 rounded-lg text-sm">
            {success}
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || message.trim().length < 5}
          className="w-full py-3 rounded-lg bg-red-500 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
        >
          {submitting ? "Отправляем…" : "Отправить"}
        </button>
      </form>
      )}
    </div>
  );
}
