// components/send-to-tv.tsx
"use client";

import { useState, useEffect } from "react";
import { Monitor, X, Loader2, Check, Copy } from "lucide-react";

interface SendToTVProps {
  streamData: {
    stream: string;
    quality: string;
    streams: Record<string, string>;
    title: string;
    translators?: { id: number; name: string }[];
    selectedTranslator?: number | null;
    searchQuery?: string;
    year?: string;
    season?: number;
    episode?: number;
    isSeries?: boolean;
    totalSeasons?: number;
    totalEpisodes?: number;
    // Media metadata for history
    mediaId?: number;
    mediaType?: "movie" | "tv";
    poster_path?: string | null;
    vote_average?: number;
    release_date?: string;
    first_air_date?: string;
    episodeName?: string;
  } | null;
}

export function SendToTV({ streamData }: SendToTVProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const createRoom = async () => {
    if (!streamData) return;
    setLoading(true);
    setError("");
    setCode(null);
    setConnected(false);
    try {
      let email: string | null = null;
      try {
        const user = JSON.parse(localStorage.getItem("user") || "null");
        email = user?.email || null;
      } catch {}

      const res = await fetch("/api/tv-room", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", stream: { ...streamData, userEmail: email } }),
      });
      const data = await res.json();
      if (data.code) setCode(data.code);
      else setError("\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u043e\u0437\u0434\u0430\u043d\u0438\u044f");
    } catch {
      setError("\u041e\u0448\u0438\u0431\u043a\u0430 \u0441\u0435\u0440\u0432\u0435\u0440\u0430");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && streamData) createRoom();
  }, [open]);

  useEffect(() => {
    if (!code || connected) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch("/api/tv-room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "status", code }),
        });
        const data = await res.json();
        if (data.connected) { setConnected(true); clearInterval(interval); }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [code, connected]);

  const copyCode = () => {
    if (code) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!streamData) return null;

  return (
    <>
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-2 px-4 py-2.5 bg-gray-800/80 hover:bg-gray-700 rounded-xl text-sm font-medium text-white transition-colors border border-white/10 backdrop-blur">
        <Monitor size={16} />
        {"\u041d\u0430 \u0422\u0412"}
      </button>
      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-[380px] overflow-hidden shadow-2xl"
            style={{ animation: "modalIn 0.3s ease-out" }}>
            <div className="flex items-center justify-between px-6 pt-6 pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                  <Monitor size={20} className="text-red-400" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">{"\u041d\u0430 \u0422\u0412"}</h3>
                  <p className="text-gray-500 text-xs truncate max-w-[220px]">{streamData.title}</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-white p-1 transition-colors"><X size={20} /></button>
            </div>
            <div className="px-6 pb-6 pt-4">
              {loading && (
                <div className="flex flex-col items-center py-8">
                  <Loader2 size={32} className="animate-spin text-red-400 mb-3" />
                  <p className="text-gray-400 text-sm">{"\u0421\u043e\u0437\u0434\u0430\u043d\u0438\u0435 \u043a\u043e\u043c\u043d\u0430\u0442\u044b..."}</p>
                </div>
              )}
              {error && (
                <div className="text-center py-6">
                  <p className="text-red-400 text-sm mb-3">{error}</p>
                  <button onClick={createRoom} className="px-4 py-2 bg-red-500 rounded-lg text-white text-sm">{"\u041f\u043e\u043f\u0440\u043e\u0431\u043e\u0432\u0430\u0442\u044c \u0441\u043d\u043e\u0432\u0430"}</button>
                </div>
              )}
              {code && !loading && !error && (
                connected ? (
                  <div className="text-center py-6">
                    <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                      <Check size={32} className="text-green-400" />
                    </div>
                    <p className="text-green-400 font-bold text-lg mb-1">{"\u0422\u0412 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d!"}</p>
                    <p className="text-gray-500 text-sm">{"\u0424\u0438\u043b\u044c\u043c \u0437\u0430\u043f\u0443\u0441\u043a\u0430\u0435\u0442\u0441\u044f"}</p>
                  </div>
                ) : (
                  <div className="text-center">
                    <p className="text-gray-400 text-sm mb-5">{"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u044d\u0442\u043e\u0442 \u043a\u043e\u0434 \u043d\u0430 \u0442\u0435\u043b\u0435\u0432\u0438\u0437\u043e\u0440\u0435"}</p>
                    <div className="flex gap-3 justify-center mb-5">
                      {code.split("").map((d, i) => (
                        <div key={i} className="w-16 h-20 rounded-xl bg-gray-800 border-2 border-white/10 flex items-center justify-center text-3xl font-black text-white">{d}</div>
                      ))}
                    </div>
                    <button onClick={copyCode}
                      className="flex items-center gap-2 mx-auto px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors">
                      {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
                      {copied ? "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e" : "\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u0442\u044c \u043a\u043e\u0434"}
                    </button>
                    <div className="mt-5 flex items-center justify-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse" />
                      <span className="text-yellow-500/70 text-xs">{"\u041e\u0436\u0438\u0434\u0430\u043d\u0438\u0435 \u0422\u0412..."}</span>
                    </div>
                    <div className="mt-4 pt-4 border-t border-white/5">
                      <p className="text-gray-600 text-xs">{"\u041e\u0442\u043a\u0440\u043e\u0439\u0442\u0435 "}<span className="text-gray-400 font-medium">kino.lead-seek.ru/cast</span>{" \u043d\u0430 \u0422\u0412"}</p>
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(10px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
    </>
  );
}
