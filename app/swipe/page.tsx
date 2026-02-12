"use client";

import { Navbar } from "@/components/navbar";
import { Heart, Users, Copy, Check, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SwipePage() {
  const [mode, setMode] = useState<"menu" | "create" | "join">("menu");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const createRoom = async () => {
    if (!name.trim()) { setError("Введите ваше имя"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", playerName: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("swipe_player", name.trim());
        setCreatedCode(data.code);
      } else setError(data.error || "Ошибка");
    } catch { setError("Сервер не отвечает"); }
    finally { setLoading(false); }
  };

  const joinRoom = async () => {
    if (!name.trim()) { setError("Введите ваше имя"); return; }
    if (!code.trim()) { setError("Введите код комнаты"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/swipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join", code: code.trim().toUpperCase(), playerName: name.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem("swipe_player", name.trim());
        router.push(`/swipe/room/${code.trim().toUpperCase()}`);
      } else setError(data.error || "Ошибка");
    } catch { setError("Сервер не отвечает"); }
    finally { setLoading(false); }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen pb-24 sm:pb-8">
        <div className="max-w-md mx-auto px-4 py-12">

          {mode === "menu" && (
            <div className="space-y-8 text-center">
              <div>
                <div className="w-24 h-24 mx-auto rounded-full bg-gradient-to-br from-pink-500 to-red-500 flex items-center justify-center mb-6 shadow-xl shadow-pink-500/20">
                  <Heart size={44} className="text-white" fill="white" />
                </div>
                <h1 className="text-4xl font-bold text-foreground mb-3">Свайп вдвоём</h1>
                <p className="text-muted-foreground text-lg leading-relaxed">
                  Выберите жанры, свайпайте фильмы — посмотрите что совпало! 🎬
                </p>
              </div>

              <div className="space-y-4">
                <button onClick={() => setMode("create")}
                  className="w-full flex items-center justify-between p-5 bg-card border border-border rounded-2xl hover:border-primary/50 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Users size={24} className="text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-foreground font-semibold">Создать комнату</h3>
                      <p className="text-muted-foreground text-sm">Получите код и отправьте партнёру</p>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </button>

                <button onClick={() => setMode("join")}
                  className="w-full flex items-center justify-between p-5 bg-card border border-border rounded-2xl hover:border-primary/50 transition-all group">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                      <ArrowRight size={24} className="text-green-400" />
                    </div>
                    <div className="text-left">
                      <h3 className="text-foreground font-semibold">Войти по коду</h3>
                      <p className="text-muted-foreground text-sm">У вас есть код от партнёра</p>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-muted-foreground group-hover:text-primary transition-colors" />
                </button>
              </div>

              <div className="pt-4">
                <h3 className="text-foreground font-semibold mb-3">Как это работает?</h3>
                <div className="space-y-3 text-left">
                  {[
                    { emoji: "1️⃣", text: "Создайте комнату и отправьте код партнёру" },
                    { emoji: "2️⃣", text: "Оба выбирают любимые жанры" },
                    { emoji: "3️⃣", text: "Свайпайте подобранные фильмы: ❤️ или ✕" },
                    { emoji: "4️⃣", text: "Смотрите совпадения и % совместимости! 🎉" },
                  ].map(step => (
                    <div key={step.emoji} className="flex items-center gap-3 p-3 bg-card rounded-xl border border-border">
                      <span className="text-lg">{step.emoji}</span>
                      <p className="text-sm text-muted-foreground">{step.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {mode === "create" && !createdCode && (
            <div className="space-y-6">
              <button onClick={() => setMode("menu")} className="text-muted-foreground hover:text-foreground text-sm">← Назад</button>
              <h2 className="text-2xl font-bold text-foreground">Создать комнату</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Ваше имя</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Егор"
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors text-lg" maxLength={20} />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button onClick={createRoom} disabled={loading}
                  className="w-full py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl font-semibold text-lg transition-colors">
                  {loading ? "Создание..." : "Создать"}
                </button>
              </div>
            </div>
          )}

          {mode === "create" && createdCode && (
            <div className="space-y-6 text-center">
              <div className="w-20 h-20 mx-auto rounded-full bg-green-500/20 flex items-center justify-center">
                <Check size={40} className="text-green-400" />
              </div>
              <h2 className="text-2xl font-bold text-foreground">Комната создана!</h2>
              <p className="text-muted-foreground">Отправьте этот код партнёру:</p>
              <div className="bg-card border-2 border-primary/50 rounded-2xl p-6">
                <p className="text-5xl font-black text-primary tracking-[0.3em] font-mono">{createdCode}</p>
              </div>
              <button onClick={copyCode}
                className="flex items-center gap-2 mx-auto px-6 py-3 bg-card border border-border hover:border-primary rounded-xl transition-colors">
                {copied ? <Check size={18} className="text-green-400" /> : <Copy size={18} className="text-muted-foreground" />}
                <span className="text-foreground">{copied ? "Скопировано!" : "Скопировать код"}</span>
              </button>
              <button onClick={() => router.push(`/swipe/room/${createdCode}`)}
                className="w-full py-3.5 bg-primary hover:bg-primary/90 text-white rounded-xl font-semibold text-lg transition-colors">
                Начать →
              </button>
            </div>
          )}

          {mode === "join" && (
            <div className="space-y-6">
              <button onClick={() => setMode("menu")} className="text-muted-foreground hover:text-foreground text-sm">← Назад</button>
              <h2 className="text-2xl font-bold text-foreground">Войти в комнату</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Ваше имя</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Например: Анюта"
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors text-lg" maxLength={20} />
                </div>
                <div>
                  <label className="text-sm text-muted-foreground block mb-2">Код комнаты</label>
                  <input type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="XXXXX"
                    className="w-full px-4 py-3 bg-card border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors text-lg text-center tracking-[0.3em] font-mono font-bold" maxLength={5} />
                </div>
                {error && <p className="text-red-400 text-sm">{error}</p>}
                <button onClick={joinRoom} disabled={loading}
                  className="w-full py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl font-semibold text-lg transition-colors">
                  {loading ? "Вход..." : "Войти"}
                </button>
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
