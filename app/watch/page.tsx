// app/watch/page.tsx - Watch Together entry point
"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Users, Plus, LogIn, Film, ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { connectSocket } from "@/lib/socket";

export default function WatchWrapper() {
  return <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center"><Loader2 size={32} className="animate-spin text-purple-500" /></div>}><WatchPage /></Suspense>;
}

function WatchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = useState<"choice" | "join">("choice");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const autoJoined = useRef(false);

  // Get name from localStorage + handle ?join=CODE
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("watch_name");
      if (saved) setName(saved);
      else {
        try {
          const user = JSON.parse(localStorage.getItem("user") || "null");
          if (user?.name) setName(user.name);
        } catch {}
      }
      // Auto-join from shared link
      const joinCode = searchParams.get("join");
      if (joinCode && !autoJoined.current) {
        autoJoined.current = true;
        setCode(joinCode.toUpperCase());
        setMode("join");
      }
    }
  }, [searchParams]);

  const saveName = (n: string) => {
    setName(n);
    if (typeof window !== "undefined") localStorage.setItem("watch_name", n);
  };

  const handleJoin = () => {
    if (!code.trim() || code.length < 4) { setError("Введите код комнаты"); return; }
    if (!name.trim()) { setError("Введите имя"); return; }
    setError("");
    setLoading(true);
    saveName(name);

    const socket = connectSocket();
    socket.emit("join-room", { code: code.toUpperCase(), name: name.trim() }, (res) => {
      setLoading(false);
      if (res.error) { setError(res.error); return; }
      router.push(`/watch/${code.toUpperCase()}`);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />

      <div className="relative z-10 w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Users size={28} className="text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Смотреть вместе</h1>
          <p className="text-gray-400">Смотрите фильмы синхронно с друзьями</p>
        </div>

        {mode === "choice" ? (
          <div className="space-y-4">
            {/* Name input */}
            <div>
              <label className="text-sm text-gray-400 mb-2 block">Ваше имя</label>
              <input
                type="text"
                value={name}
                onChange={(e) => saveName(e.target.value)}
                placeholder="Как вас зовут?"
                maxLength={20}
                className="w-full px-5 py-4 bg-white/[0.06] border-2 border-white/10 rounded-2xl text-white text-lg placeholder-gray-600 focus:border-purple-500 focus:outline-none transition-colors"
              />
            </div>

            {/* Create room - goes to movie selection */}
            <Link href="/watch/create" className="block">
              <div className="w-full p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border-2 border-purple-500/20 rounded-2xl hover:border-purple-500/40 transition-all group cursor-pointer">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                    <Plus size={24} className="text-purple-400" />
                  </div>
                  <div className="text-left">
                    <p className="text-white font-semibold text-lg">Создать комнату</p>
                    <p className="text-gray-400 text-sm">Выберите фильм и пригласите друзей</p>
                  </div>
                </div>
              </div>
            </Link>

            {/* Join room */}
            <button onClick={() => setMode("join")} className="w-full p-6 bg-white/[0.04] border-2 border-white/10 rounded-2xl hover:border-white/20 transition-all group text-left">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center group-hover:bg-white/15 transition-colors">
                  <LogIn size={24} className="text-gray-300" />
                </div>
                <div>
                  <p className="text-white font-semibold text-lg">Присоединиться</p>
                  <p className="text-gray-400 text-sm">Введите код от друга</p>
                </div>
              </div>
            </button>

            {/* Back to home */}
            <Link href="/" className="flex items-center justify-center gap-2 text-gray-500 hover:text-gray-300 transition-colors pt-4">
              <ArrowLeft size={16} />
              <span className="text-sm">На главную</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            <button onClick={() => { setMode("choice"); setError(""); }} className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-4">
              <ArrowLeft size={16} />
              <span className="text-sm">Назад</span>
            </button>

            <div>
              <label className="text-sm text-gray-400 mb-2 block">Код комнаты</label>
              <input
                type="text"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase().slice(0, 6)); setError(""); }}
                placeholder="ABCDEF"
                maxLength={6}
                className="w-full px-5 py-4 bg-white/[0.06] border-2 border-white/10 rounded-2xl text-white text-2xl text-center font-mono tracking-[0.3em] placeholder-gray-600 focus:border-purple-500 focus:outline-none transition-colors uppercase"
                autoFocus
              />
            </div>

            {!name && (
              <div>
                <label className="text-sm text-gray-400 mb-2 block">Ваше имя</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => saveName(e.target.value)}
                  placeholder="Имя"
                  maxLength={20}
                  className="w-full px-5 py-4 bg-white/[0.06] border-2 border-white/10 rounded-2xl text-white text-lg placeholder-gray-600 focus:border-purple-500 focus:outline-none transition-colors"
                />
              </div>
            )}

            {error && <p className="text-red-400 text-sm text-center">{error}</p>}

            <button onClick={handleJoin} disabled={loading || code.length < 4}
              className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg rounded-2xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? "Подключение..." : "Войти в комнату"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
