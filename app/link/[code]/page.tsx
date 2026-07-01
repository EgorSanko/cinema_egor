"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Check, Loader2, Monitor, ShieldCheck, Tv } from "lucide-react";

/**
 * Phone-side confirmation page for QR device-link login. The user lands here by
 * scanning the QR shown on a TV / another device. If they're already logged in
 * on this phone we just ask them to confirm; otherwise a compact sign-in first.
 */
export default function LinkConfirmPage() {
  const params = useParams<{ code: string }>();
  const code = String(params?.code || "").toUpperCase();

  const [phase, setPhase] = useState<"checking" | "invalid" | "confirm" | "login" | "done" | "error">("checking");
  const [intent, setIntent] = useState<"tv" | "web">("tv");
  const [me, setMe] = useState<{ email: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  // login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tv-link", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "info", code }),
        });
        const data = await res.json();
        if (!data.valid) { setPhase("invalid"); return; }
        setIntent(data.intent === "web" ? "web" : "tv");
      } catch { setPhase("invalid"); return; }

      // Already signed in on this phone?
      try {
        const u = JSON.parse(localStorage.getItem("user") || "null");
        if (u?.email) { setMe({ email: u.email, name: u.name || u.email.split("@")[0] }); setPhase("confirm"); return; }
      } catch {}
      setPhase("login");
    })();
  }, [code]);

  async function confirm(user: { email: string; name: string }) {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/tv-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "confirm", code, user }),
      });
      const data = await res.json();
      if (data.success) setPhase("done");
      else { setErr(data.error || "Не удалось подтвердить"); setPhase("error"); }
    } catch { setErr("Нет связи с сервером"); setPhase("error"); }
    finally { setBusy(false); }
  }

  async function doLogin() {
    const e = email.trim().toLowerCase();
    if (!e || !password) { setErr("Введите email и пароль"); return; }
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "login", email: e, password }),
      });
      const data = await res.json();
      if (data.success && data.user) {
        localStorage.setItem("user", JSON.stringify({ email: data.user.email, name: data.user.name }));
        await confirm({ email: data.user.email, name: data.user.name });
      } else { setErr(data.error || "Ошибка входа"); }
    } catch { setErr("Нет связи с сервером"); }
    finally { setBusy(false); }
  }

  const deviceWord = intent === "tv" ? "телевизор" : "устройство";

  return (
    <main className="min-h-screen flex items-center justify-center px-5 py-8"
      style={{ background: "radial-gradient(120% 120% at 50% 0%, #14532d22, transparent 55%), #0b0b12", color: "#f5f5f7" }}>
      <div className="w-full max-w-[380px]">
        <div className="flex flex-col items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="SAPKEFLY KINO" className="h-9 w-auto mb-1"
            style={{ filter: "drop-shadow(0 0 22px rgba(163,230,53,0.45))" }} />
        </div>

        <div className="rounded-3xl p-6 border border-white/10"
          style={{ background: "#15151f", boxShadow: "0 20px 60px -12px rgba(0,0,0,0.7)" }}>

          {phase === "checking" && (
            <div className="flex flex-col items-center py-10 gap-3">
              <Loader2 className="animate-spin text-[#a3e635]" size={30} />
              <p className="text-white/60 text-sm">Проверяем код…</p>
            </div>
          )}

          {phase === "invalid" && (
            <div className="text-center py-8">
              <p className="text-lg font-bold mb-1">Код недействителен</p>
              <p className="text-white/50 text-sm">Он истёк или уже использован. Обновите QR-код на {deviceWord}е и отсканируйте снова.</p>
            </div>
          )}

          {phase === "confirm" && me && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-[#a3e635]/12 flex items-center justify-center mx-auto mb-4">
                {intent === "tv" ? <Tv className="text-[#a3e635]" size={26} /> : <Monitor className="text-[#a3e635]" size={26} />}
              </div>
              <h1 className="text-xl font-extrabold mb-1">Вход на {deviceWord}</h1>
              <p className="text-white/55 text-sm mb-5">Подтвердите вход в аккаунт</p>
              <div className="rounded-2xl px-4 py-3 mb-5 flex items-center gap-3 text-left" style={{ background: "#0f0f18" }}>
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#a3e635] to-[#16a34a] flex items-center justify-center text-black font-black">
                  {(me.name || me.email)[0]?.toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{me.name}</p>
                  <p className="text-white/45 text-xs truncate">{me.email}</p>
                </div>
              </div>
              <button disabled={busy} onClick={() => confirm(me)}
                className="w-full h-12 rounded-2xl font-bold text-black flex items-center justify-center gap-2 transition-transform active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#a3e635,#16a34a)" }}>
                {busy ? <Loader2 className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                Подтвердить вход
              </button>
              {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
              <p className="text-white/30 text-[11px] mt-4 flex items-center justify-center gap-1">
                <ShieldCheck size={12} /> Подтверждайте, только если сами открыли {deviceWord}
              </p>
            </div>
          )}

          {phase === "login" && (
            <div>
              <h1 className="text-xl font-extrabold mb-1 text-center">Войдите, чтобы продолжить</h1>
              <p className="text-white/55 text-sm mb-5 text-center">И подтвердите вход на {deviceWord}</p>
              <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" inputMode="email"
                placeholder="Email" autoComplete="email"
                className="w-full h-12 rounded-2xl px-4 mb-3 outline-none border border-white/10 focus:border-[#a3e635]/60"
                style={{ background: "#0f0f18", color: "#fff" }} />
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password"
                placeholder="Пароль" autoComplete="current-password"
                onKeyDown={(e) => e.key === "Enter" && doLogin()}
                className="w-full h-12 rounded-2xl px-4 mb-4 outline-none border border-white/10 focus:border-[#a3e635]/60"
                style={{ background: "#0f0f18", color: "#fff" }} />
              <button disabled={busy} onClick={doLogin}
                className="w-full h-12 rounded-2xl font-bold text-black flex items-center justify-center gap-2 active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg,#a3e635,#16a34a)" }}>
                {busy ? <Loader2 className="animate-spin" size={18} /> : null}
                Войти и подтвердить
              </button>
              {err && <p className="text-red-400 text-sm mt-3 text-center">{err}</p>}
            </div>
          )}

          {phase === "done" && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "linear-gradient(135deg,#a3e635,#16a34a)" }}>
                <Check className="text-black" size={34} strokeWidth={3} />
              </div>
              <h1 className="text-xl font-extrabold mb-1">Готово!</h1>
              <p className="text-white/55 text-sm">Вернитесь к {deviceWord}у — вход выполнен.</p>
            </div>
          )}

          {phase === "error" && (
            <div className="text-center py-8">
              <p className="text-lg font-bold mb-1 text-red-400">Не получилось</p>
              <p className="text-white/50 text-sm mb-4">{err}</p>
              <button onClick={() => setPhase(me ? "confirm" : "login")}
                className="px-5 h-11 rounded-xl font-semibold" style={{ background: "#26263a", color: "#fff" }}>
                Попробовать снова
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-white/25 text-xs mt-5">SAPKEFLY KINO · безопасный вход по QR</p>
      </div>
    </main>
  );
}
