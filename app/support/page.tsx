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

  useEffect(() => {
    try {
      const raw = localStorage.getItem("user");
      if (raw) setUser(JSON.parse(raw));
    } catch {}
    setAuthChecked(true);
  }, []);

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
      setSuccess(`Заявка #${data.id.slice(0, 8)} принята. Мы напишем тебе на ${user.email}.`);
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
        Опиши проблему или предложение. Прочитаем и ответим на {user.email}.
      </p>

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
    </div>
  );
}
