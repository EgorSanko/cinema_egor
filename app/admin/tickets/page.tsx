"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

interface Ticket {
  id: string;
  email: string;
  category: "bug" | "feature" | "question" | "other";
  subject: string;
  message: string;
  meta: {
    platform: "web" | "android" | "ios" | "unknown";
    appVersion?: string;
    userAgent?: string;
    currentScreen?: string;
  };
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: number;
  hasScreenshot: boolean;
  screenshotExt?: string;
  reply?: string;
  repliedAt?: number;
  repliedBy?: string;
}

const ADMIN_EMAILS = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",").map(e => e.trim().toLowerCase()).filter(Boolean);

const STATUS_LABEL: Record<Ticket["status"], string> = {
  open: "🟡 Новая",
  in_progress: "🔵 В работе",
  resolved: "🟢 Решена",
  closed: "⚫️ Закрыта",
};
const CATEGORY_LABEL: Record<Ticket["category"], string> = {
  bug: "🐛 Баг",
  feature: "💡 Идея",
  question: "❓ Вопрос",
  other: "📝 Другое",
};

function ago(ts: number): string {
  const sec = Math.round((Date.now() - ts) / 1000);
  if (sec < 60) return "только что";
  if (sec < 3600) return `${Math.round(sec / 60)} мин назад`;
  if (sec < 86400) return `${Math.round(sec / 3600)} ч назад`;
  return `${Math.round(sec / 86400)} дн назад`;
}

export default function AdminTicketsPage() {
  const router = useRouter();
  const [adminEmail, setAdminEmail] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState<"all" | Ticket["status"]>("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [replyDraft, setReplyDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      const email = u?.email?.toLowerCase?.();
      if (email && ADMIN_EMAILS.includes(email)) setAdminEmail(email);
    } catch {}
    setAuthChecked(true);
  }, []);

  const fetchTickets = useCallback(async () => {
    if (!adminEmail) return;
    try {
      const params = new URLSearchParams({ email: adminEmail });
      if (filter !== "all") params.set("status", filter);
      const res = await fetch(`/api/tickets?${params}`);
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      setTickets(data.tickets || []);
      setCounts(data.counts || {});
      setError(null);
    } catch (e: any) {
      setError(e?.message || "Ошибка");
    }
  }, [adminEmail, filter]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  // Light poll — admin probably keeps the tab open. 15s is gentle enough.
  useEffect(() => {
    if (!adminEmail) return;
    const i = setInterval(fetchTickets, 15_000);
    return () => clearInterval(i);
  }, [adminEmail, fetchTickets]);

  async function patchTicket(id: string, body: any) {
    if (!adminEmail) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, email: adminEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Ошибка");
        return;
      }
      setSelected(data.ticket);
      await fetchTickets();
    } finally {
      setBusy(false);
    }
  }

  async function deleteTicket(id: string) {
    if (!adminEmail || !confirm("Удалить заявку?")) return;
    setBusy(true);
    try {
      await fetch(`/api/tickets/${id}?email=${encodeURIComponent(adminEmail)}`, { method: "DELETE" });
      setSelected(null);
      await fetchTickets();
    } finally {
      setBusy(false);
    }
  }

  if (!authChecked) {
    return <div className="min-h-screen flex items-center justify-center text-white/50">…</div>;
  }
  if (!adminEmail) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center">
          <h1 className="text-xl font-bold mb-2">Только для админа</h1>
          <p className="text-white/60 mb-4">Войди под админ-аккаунтом, чтобы увидеть заявки.</p>
          <button onClick={() => router.push("/profile")} className="px-6 py-3 rounded-lg bg-red-500 hover:bg-red-600">
            На профиль
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar — ticket list */}
      <aside className="md:w-[380px] md:min-h-screen border-r border-white/[0.08] flex flex-col">
        <div className="p-4 border-b border-white/[0.08]">
          <h1 className="text-lg font-bold mb-2">Заявки</h1>
          <div className="flex gap-1 flex-wrap">
            {(["all", "open", "in_progress", "resolved", "closed"] as const).map(s => (
              <button
                key={s}
                onClick={() => { setFilter(s); setSelected(null); }}
                className={`px-2 py-1 rounded text-xs font-medium ${
                  filter === s ? "bg-red-500 text-white" : "bg-white/[0.05] text-white/60 hover:bg-white/[0.1]"
                }`}
              >
                {s === "all" ? "Все" : STATUS_LABEL[s].split(" ")[1]}
                {s !== "all" && counts[s] ? ` (${counts[s]})` : ""}
              </button>
            ))}
          </div>
          {error && <div className="mt-2 text-xs text-red-400">{error}</div>}
        </div>

        <div className="overflow-y-auto flex-1">
          {tickets.length === 0 ? (
            <div className="p-6 text-center text-white/40 text-sm">Пусто</div>
          ) : (
            tickets.map(t => (
              <button
                key={t.id}
                onClick={() => { setSelected(t); setReplyDraft(t.reply || ""); }}
                className={`w-full text-left p-3 border-b border-white/[0.04] hover:bg-white/[0.03] ${
                  selected?.id === t.id ? "bg-white/[0.06]" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs text-white/40">{CATEGORY_LABEL[t.category]}</span>
                  <span className="text-xs text-white/40">{ago(t.createdAt)}</span>
                </div>
                <div className="text-sm font-medium text-white truncate">{t.subject}</div>
                <div className="text-xs text-white/50 truncate">{t.email}</div>
                <div className="text-xs mt-1">{STATUS_LABEL[t.status]}</div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Detail pane */}
      <main className="flex-1 p-4 md:p-6 md:max-h-screen md:overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-white/40">
            Выбери заявку слева
          </div>
        ) : (
          <div className="max-w-2xl space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-1 text-xs text-white/40">
                <span>{CATEGORY_LABEL[selected.category]}</span>
                <span>·</span>
                <span>{STATUS_LABEL[selected.status]}</span>
                <span>·</span>
                <span>{ago(selected.createdAt)}</span>
                <span>·</span>
                <span className="font-mono">{selected.id.slice(0, 12)}</span>
              </div>
              <h2 className="text-xl font-bold">{selected.subject}</h2>
              <div className="text-sm text-white/60 mt-1">
                от <a href={`mailto:${selected.email}`} className="text-red-400 hover:underline">{selected.email}</a>
              </div>
            </div>

            <div className="bg-white/[0.04] rounded-xl p-4 whitespace-pre-wrap text-[14px] leading-relaxed">
              {selected.message}
            </div>

            {selected.hasScreenshot && (
              <div>
                <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Скриншот</div>
                <a
                  href={`/api/tickets/${selected.id}/image?email=${encodeURIComponent(adminEmail)}`}
                  target="_blank"
                  rel="noopener"
                  className="block bg-white/[0.04] rounded-lg overflow-hidden"
                >
                  <img
                    src={`/api/tickets/${selected.id}/image?email=${encodeURIComponent(adminEmail)}`}
                    alt="screenshot"
                    className="max-h-[400px] w-auto"
                  />
                </a>
              </div>
            )}

            <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-3 text-xs text-white/50">
              <div><b>Платформа:</b> {selected.meta.platform} {selected.meta.appVersion ? `· ${selected.meta.appVersion}` : ""}</div>
              {selected.meta.currentScreen && <div><b>Экран:</b> {selected.meta.currentScreen}</div>}
              {selected.meta.userAgent && <div className="truncate"><b>UA:</b> {selected.meta.userAgent}</div>}
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Ответ</div>
              <textarea
                value={replyDraft}
                onChange={e => setReplyDraft(e.target.value)}
                rows={4}
                placeholder="Напиши ответ (или просто смени статус)..."
                className="w-full px-3 py-2.5 rounded-lg bg-white/[0.06] text-white placeholder-white/30 focus:outline-none focus:bg-white/[0.1] resize-y"
              />
              <button
                onClick={() => patchTicket(selected.id, { reply: replyDraft })}
                disabled={busy || replyDraft.trim().length < 1}
                className="mt-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 disabled:opacity-40 text-sm font-medium"
              >
                Сохранить ответ
              </button>
              {selected.reply && selected.repliedAt && (
                <div className="mt-1 text-xs text-white/40">
                  Последний ответ: {ago(selected.repliedAt)} ({selected.repliedBy})
                </div>
              )}
            </div>

            <div>
              <div className="text-xs uppercase tracking-wider text-white/40 mb-1">Сменить статус</div>
              <div className="flex flex-wrap gap-2">
                {(["open", "in_progress", "resolved", "closed"] as const).map(s => (
                  <button
                    key={s}
                    onClick={() => patchTicket(selected.id, { status: s })}
                    disabled={busy || selected.status === s}
                    className={`px-3 py-2 rounded-lg text-sm font-medium ${
                      selected.status === s
                        ? "bg-white/[0.15] text-white"
                        : "bg-white/[0.05] text-white/70 hover:bg-white/[0.1]"
                    }`}
                  >
                    {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => deleteTicket(selected.id)}
              disabled={busy}
              className="text-sm text-red-400 hover:text-red-300"
            >
              Удалить заявку навсегда
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
