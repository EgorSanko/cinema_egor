"use client";

import { useState, useEffect } from "react";
import { useAuth } from "./auth-context";
import { X, Eye, EyeOff, LogIn, UserPlus, ShieldCheck, KeyRound, ArrowLeft, QrCode, Smartphone } from "lucide-react";
import { StyledQR } from "./styled-qr";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Optional subtitle shown above the form — explains WHY the user was
   *  forced to log in (e.g. "Войдите, чтобы смотреть фильм"). */
  reason?: string;
}

type Step = "login" | "register" | "verify" | "forgot" | "reset" | "qr";

const inputCls =
  "w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors";

export function AuthModal({ isOpen, onClose, reason }: AuthModalProps) {
  const { login, register, verifyRegister, forgotPassword, resetPassword, resendCode } = useAuth();
  const [step, setStep] = useState<Step>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // QR login: mint a link-code while the "qr" step is open and poll until the
  // phone confirms, then finish by storing the user + reloading (same as a
  // normal login, which AuthProvider picks up from localStorage on mount).
  useEffect(() => {
    if (!isOpen || step !== "qr") { setLinkUrl(""); return; }
    let alive = true;
    let poll: ReturnType<typeof setInterval> | null = null;
    const startPoll = (code: string) => {
      poll = setInterval(async () => {
        try {
          const r = await fetch("/api/tv-link", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "status", code }),
          });
          const d = await r.json();
          if (!alive) return;
          if (d.status === "authorized" && d.user?.email) {
            if (poll) clearInterval(poll);
            localStorage.setItem("user", JSON.stringify({ email: d.user.email, name: d.user.name || d.user.email.split("@")[0] }));
            window.location.reload();
          } else if (d.status === "expired") {
            if (poll) clearInterval(poll); create();
          }
        } catch {}
      }, 2000);
    };
    const create = async () => {
      try {
        const r = await fetch("/api/tv-link", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "create", intent: "web" }),
        });
        const d = await r.json();
        if (!alive || !d.code) return;
        setLinkUrl(`${window.location.origin}/link/${d.code}`);
        startPoll(d.code);
      } catch {}
    };
    create();
    return () => { alive = false; if (poll) clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, step]);

  if (!isOpen) return null;

  const reset = () => { setError(""); setInfo(""); setLoading(false); };
  const close = () => {
    onClose();
    setStep("login"); setName(""); setEmail(""); setPassword(""); setCode("");
    setError(""); setInfo(""); setDevCode(null);
  };
  const goto = (s: Step) => { reset(); setCode(""); setStep(s); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setInfo(""); setLoading(true);
    try {
      if (step === "login") {
        const err = await login(email, password);
        if (err) setError(err); else close();
      } else if (step === "register") {
        const r = await register(name, email, password);
        if (r.error) setError(r.error);
        else { setCode(""); setStep("verify"); setInfo("Мы отправили код на " + email); setDevCode(r.devCode || null); }
      } else if (step === "verify") {
        const err = await verifyRegister(email, code);
        if (err) setError(err); else close();
      } else if (step === "forgot") {
        const r = await forgotPassword(email);
        if (r.error) setError(r.error);
        else { setCode(""); setStep("reset"); setInfo("Если аккаунт существует — код отправлен на " + email); setDevCode(r.devCode || null); }
      } else if (step === "reset") {
        const err = await resetPassword(email, code, password);
        if (err) setError(err); else close();
      }
    } catch { setError("Ошибка сети"); }
    finally { setLoading(false); }
  };

  const onResend = async () => {
    setError(""); setInfo("");
    const r = await resendCode(email);
    if (r.error) setError(r.error);
    else { setInfo("Код отправлен повторно"); setDevCode(r.devCode || null); }
  };

  const titles: Record<Step, string> = {
    login: "Вход", register: "Регистрация", verify: "Подтверждение почты",
    forgot: "Восстановление пароля", reset: "Новый пароль", qr: "Вход по QR-коду",
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={close}>
      <div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {(step === "verify" || step === "reset" || step === "qr") && (
              <button onClick={() => goto(step === "verify" ? "register" : step === "qr" ? "login" : "forgot")} className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-xl font-bold text-foreground">{titles[step]}</h2>
          </div>
          <button onClick={close} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        {reason && step === "login" && (
          <div className="mb-5 px-3 py-2.5 rounded-lg bg-primary/10 ring-1 ring-primary/25 text-primary text-[13px] font-medium">{reason}</div>
        )}
        {info && <div className="mb-4 px-3 py-2.5 rounded-lg bg-white/[0.05] ring-1 ring-white/10 text-foreground/80 text-[13px]">{info}</div>}
        {devCode && (
          <div className="mb-4 px-3 py-2.5 rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 text-amber-300 text-[13px]">
            Тест-код (почта ещё не настроена): <span className="font-mono font-bold tracking-widest">{devCode}</span>
          </div>
        )}

        {step === "qr" && (
          <div className="flex flex-col items-center pt-1 pb-2">
            <div className="min-h-[240px] flex items-center justify-center">
              {linkUrl ? (
                <StyledQR value={linkUrl} size={240} />
              ) : (
                <div className="w-[240px] h-[240px] rounded-2xl bg-white/[0.04] flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                </div>
              )}
            </div>
            <div className="mt-5 flex items-start gap-3 text-left w-full px-1">
              <Smartphone size={20} className="text-primary shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground leading-snug">
                Откройте камеру телефона, где вы уже вошли в SAPKEFLY, наведите на код и подтвердите вход. Аккаунт перенесётся сюда автоматически.
              </p>
            </div>
          </div>
        )}

        {step !== "qr" && (
        <form onSubmit={submit} className="space-y-4">
          {step === "register" && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Имя</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ваше имя" className={inputCls} />
            </div>
          )}

          {(step === "login" || step === "register" || step === "forgot") && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="your@email.com" className={inputCls} />
            </div>
          )}

          {(step === "verify" || step === "reset") && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">Код из письма</label>
              <input
                inputMode="numeric" autoComplete="one-time-code" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                required placeholder="123456"
                className={inputCls + " text-center text-lg tracking-[8px] font-mono"} />
            </div>
          )}

          {(step === "login" || step === "register" || step === "reset") && (
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {step === "reset" ? "Новый пароль" : "Пароль"}
              </label>
              <div className="relative">
                <input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="Минимум 6 символов" className={inputCls + " pr-12"} />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <button type="submit" disabled={loading} className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
            {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
              <>
                {step === "login" && <><LogIn size={18} /> Войти</>}
                {step === "register" && <><UserPlus size={18} /> Зарегистрироваться</>}
                {step === "verify" && <><ShieldCheck size={18} /> Подтвердить</>}
                {step === "forgot" && <><KeyRound size={18} /> Отправить код</>}
                {step === "reset" && <><ShieldCheck size={18} /> Сменить пароль</>}
              </>
            )}
          </button>
        </form>
        )}

        {(step === "verify" || step === "reset") && (
          <button onClick={onResend} className="mt-3 w-full text-center text-sm text-primary hover:underline">Отправить код повторно</button>
        )}

        <div className="mt-4 text-center space-y-1.5">
          {step === "login" && (
            <>
              <button onClick={() => goto("qr")} className="mb-2 w-full py-2.5 rounded-xl border border-primary/30 bg-primary/[0.06] hover:bg-primary/10 text-primary font-medium text-sm flex items-center justify-center gap-2 transition-colors">
                <QrCode size={17} /> Войти по QR-коду
              </button>
              <button onClick={() => goto("forgot")} className="block w-full text-sm text-muted-foreground hover:text-foreground">Забыли пароль?</button>
              <button onClick={() => goto("register")} className="block w-full text-sm text-primary hover:underline">Нет аккаунта? Зарегистрироваться</button>
            </>
          )}
          {step === "register" && (
            <button onClick={() => goto("login")} className="text-sm text-primary hover:underline">Уже есть аккаунт? Войти</button>
          )}
          {(step === "forgot") && (
            <button onClick={() => goto("login")} className="text-sm text-primary hover:underline">Вспомнили? Войти</button>
          )}
        </div>
      </div>
    </div>
  );
}
