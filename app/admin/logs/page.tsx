"use client";

import { useEffect, useRef, useState } from "react";

interface LogEntry { src: string; line: string; ts: number }

/**
 * Live prod log viewer. Hits /api/admin/logs (SSE) and tails PM2 stdout/stderr
 * of kino-web (+ kino-api / kino-socket when those logs are present). Token-
 * gated so it's not public. Auto-scrolls but lets the user pause by scrolling
 * away from the bottom.
 *
 * Usage: open /admin/logs, paste the ADMIN_TOKEN from VPS /root/movie/.env.local
 */
export default function AdminLogs() {
  const [token, setToken] = useState("");
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Persist token across reloads — typing it on a phone is painful.
  useEffect(() => {
    const saved = localStorage.getItem("admin_logs_token");
    if (saved) setToken(saved);
  }, []);
  useEffect(() => {
    if (token) localStorage.setItem("admin_logs_token", token);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setError(null);
    const es = new EventSource(`/api/admin/logs?token=${encodeURIComponent(token)}`);
    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      setError("Соединение разорвано. Проверьте токен или перезагрузите страницу.");
      es.close();
    };
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { src: string; line: string };
        setLogs(prev => [...prev.slice(-1500), { ...data, ts: Date.now() }]);
      } catch {}
    };
    return () => { es.close(); setConnected(false); };
  }, [token]);

  useEffect(() => {
    if (!autoScroll || !scrollerRef.current) return;
    scrollerRef.current.scrollTop = scrollerRef.current.scrollHeight;
  }, [logs, autoScroll]);

  const visible = filter
    ? logs.filter(l => l.line.toLowerCase().includes(filter.toLowerCase()) || l.src.includes(filter))
    : logs;

  const sourceColor = (src: string) =>
    src.includes("error") ? "#fca5a5"
    : src.includes("kino-web") ? "#bef264"
    : src.includes("kino-api") ? "#93c5fd"
    : src.includes("kino-socket") ? "#fbbf24"
    : "#9ca3af";

  return (
    <main className="min-h-screen bg-black text-white p-3 sm:p-5">
      <div className="max-w-7xl mx-auto space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-base sm:text-lg font-bold">PM2 live logs</h1>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${connected ? "bg-green-500/20 text-green-300" : "bg-red-500/20 text-red-300"}`}>
            {connected ? "online" : "offline"}
          </span>
          <span className="text-[11px] text-white/40">{logs.length} строк</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value.trim())}
            placeholder="ADMIN_TOKEN"
            className="px-3 py-2 rounded-lg bg-white/[0.06] text-white text-[13px] placeholder-white/30 focus:outline-none focus:bg-white/[0.10]"
          />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="фильтр (ERROR, OK, /api/...)"
            className="px-3 py-2 rounded-lg bg-white/[0.06] text-white text-[13px] placeholder-white/30 focus:outline-none focus:bg-white/[0.10]"
          />
        </div>

        <div className="flex items-center gap-3 text-[12px]">
          <label className="inline-flex items-center gap-1.5 cursor-pointer">
            <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
            Авто-скролл
          </label>
          <button onClick={() => setLogs([])} className="px-2 py-1 rounded-md bg-white/[0.08] hover:bg-white/[0.15] text-[11px]">очистить</button>
        </div>

        {error && (
          <div className="px-3 py-2 rounded-lg bg-red-500/15 text-red-200 text-[13px]">{error}</div>
        )}

        <div
          ref={scrollerRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
            setAutoScroll(atBottom);
          }}
          className="h-[70vh] overflow-y-auto rounded-lg bg-black ring-1 ring-white/10 p-2 sm:p-3 font-mono text-[11px] leading-relaxed"
        >
          {visible.length === 0 && !connected && (
            <div className="text-white/40 text-center py-12">{token ? "Подключение..." : "Введи ADMIN_TOKEN сверху"}</div>
          )}
          {visible.map((l, i) => (
            <div key={i} className="whitespace-pre-wrap break-words">
              <span style={{ color: sourceColor(l.src) }}>[{l.src}]</span>{" "}
              <span className="text-white/90">{l.line}</span>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
