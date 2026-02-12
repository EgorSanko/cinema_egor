"use client";

import { useState } from "react";
import { useAuth } from "./auth-context";
import { X, Eye, EyeOff, LogIn, UserPlus } from "lucide-react";

interface AuthModalProps {
isOpen: boolean;
onClose: () => void;
}

export function AuthModal({ isOpen, onClose }: AuthModalProps) {
const { login, register } = useAuth();
const [mode, setMode] = useState<"login" | "register">("login");
const [name, setName] = useState("");
const [email, setEmail] = useState("");
const [password, setPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);
const [error, setError] = useState("");
const [loading, setLoading] = useState(false);

if (!isOpen) return null;

const handleSubmit = async (e: React.FormEvent) => {
e.preventDefault();
setError("");
setLoading(true);
try {
let err: string | null;
if (mode === "login") {
err = await login(email, password);
} else {
err = await register(name, email, password);
}
if (err) setError(err);
else { onClose(); setName(""); setEmail(""); setPassword(""); }
} catch { setError("Ошибка сети"); }
finally { setLoading(false); }
};

return (
<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
<div className="bg-card border border-border rounded-2xl max-w-md w-full p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
<div className="flex items-center justify-between mb-6">
<h2 className="text-xl font-bold text-foreground">
{mode === "login" ? "Вход" : "Регистрация"}
</h2>
<button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
<X size={20} />
</button>
</div>

<form onSubmit={handleSubmit} className="space-y-4">
{mode === "register" && (
<div>
<label className="block text-sm font-medium text-muted-foreground mb-1.5">Имя</label>
<input type="text" value={name} onChange={(e) => setName(e.target.value)} required
placeholder="Ваше имя"
className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors" />
</div>
)}

<div>
<label className="block text-sm font-medium text-muted-foreground mb-1.5">Email</label>
<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
placeholder="your@email.com"
className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors" />
</div>

<div>
<label className="block text-sm font-medium text-muted-foreground mb-1.5">Пароль</label>
<div className="relative">
<input type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required
placeholder="Минимум 6 символов"
className="w-full px-4 py-3 bg-background border border-border rounded-xl text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary transition-colors pr-12" />
<button type="button" onClick={() => setShowPassword(!showPassword)}
className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
</button>
</div>
</div>

{error && <p className="text-red-400 text-sm">{error}</p>}

<button type="submit" disabled={loading}
className="w-full py-3 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
{loading ? (
<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
) : mode === "login" ? (
<><LogIn size={18} /> Войти</>
) : (
<><UserPlus size={18} /> Зарегистрироваться</>
)}
</button>
</form>

<div className="mt-4 text-center">
<button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
className="text-sm text-primary hover:underline">
{mode === "login" ? "Нет аккаунта? Зарегистрироваться" : "Уже есть аккаунт? Войти"}
</button>
</div>
</div>
</div>
);
}
