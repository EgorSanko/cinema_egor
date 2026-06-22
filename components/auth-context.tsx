"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { syncFromServer } from "@/lib/storage";

interface User {
  email: string;
  name: string;
}

type RegisterResult = { error?: string; pending?: boolean; devCode?: string };
type CodeResult = { error?: string; devCode?: string };

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<string | null>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  verifyRegister: (email: string, code: string) => Promise<string | null>;
  forgotPassword: (email: string) => Promise<CodeResult>;
  resetPassword: (email: string, code: string, password: string) => Promise<string | null>;
  resendCode: (email: string) => Promise<CodeResult>;
  logout: () => void;
  syncing: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

async function postAuth(payload: any) {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("user");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setUser(parsed);
        if (parsed?.email) {
          setSyncing(true);
          syncFromServer(parsed.email).finally(() => setSyncing(false));
        }
      } catch {}
    }
  }, []);

  // Shared: persist the authenticated user, pull their server data, reflect it.
  const completeAuth = async (u: User, reload: boolean) => {
    setUser(u);
    localStorage.setItem("user", JSON.stringify(u));
    setSyncing(true);
    await syncFromServer(u.email);
    setSyncing(false);
    if (reload) window.location.reload();
  };

  const login = async (email: string, password: string): Promise<string | null> => {
    const data = await postAuth({ action: "login", email, password });
    if (data.success) {
      await completeAuth(data.user, true);
      return null;
    }
    return data.error || "Ошибка входа";
  };

  // Register now stages a pending account and emails a code — caller then
  // collects the code and calls verifyRegister.
  const register = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    const data = await postAuth({ action: "register", name, email, password });
    if (data.pending) return { pending: true, devCode: data.devCode };
    return { error: data.error || "Ошибка регистрации" };
  };

  const verifyRegister = async (email: string, code: string): Promise<string | null> => {
    const data = await postAuth({ action: "verify", email, code });
    if (data.success) {
      await completeAuth(data.user, false);
      return null;
    }
    return data.error || "Неверный код";
  };

  const forgotPassword = async (email: string): Promise<CodeResult> => {
    const data = await postAuth({ action: "forgot", email });
    if (data.success) return { devCode: data.devCode };
    return { error: data.error || "Ошибка" };
  };

  const resetPassword = async (email: string, code: string, password: string): Promise<string | null> => {
    const data = await postAuth({ action: "reset", email, code, password });
    if (data.success) {
      await completeAuth(data.user, true);
      return null;
    }
    return data.error || "Не удалось сменить пароль";
  };

  const resendCode = async (email: string): Promise<CodeResult> => {
    const data = await postAuth({ action: "resend", email });
    if (data.success) return { devCode: data.devCode };
    return { error: data.error || "Не удалось отправить" };
  };

  const logout = () => {
    const email = user?.email;
    if (email) {
      const data = {
        favorites: JSON.parse(localStorage.getItem("kino_favorites") || "[]"),
        history: JSON.parse(localStorage.getItem("kino_history") || "[]"),
        positions: (() => {
          const p: any = {};
          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key?.startsWith("kino_pos_")) {
              try { p[key] = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
            }
          }
          return p;
        })(),
        comments: JSON.parse(localStorage.getItem("kino_comments") || "[]"),
      };
      fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save", email, data }),
      }).catch(() => {});
    }
    setUser(null);
    localStorage.removeItem("user");
  };

  return (
    <AuthContext.Provider value={{ user, login, register, verifyRegister, forgotPassword, resetPassword, resendCode, logout, syncing }}>
      {children}
    </AuthContext.Provider>
  );
}
