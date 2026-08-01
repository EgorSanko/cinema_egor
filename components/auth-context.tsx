"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { syncFromServer, loadFromServer, clearLocalProfile, getDataOwner } from "@/lib/storage";

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

// Safe logged-out stub for when useAuth is called outside an AuthProvider —
// notably the root not-found.tsx / error boundaries, which render <Navbar/>
// (uses useAuth) OUTSIDE the provider tree. Throwing there turned a soft 404
// (e.g. a TMDB blip → getMovieDetails null → notFound()) into a hard 500
// cascade that took the whole site down. Degrade to "logged out" instead.
const AUTH_STUB: AuthContextType = {
  user: null,
  login: async () => null,
  register: async () => ({ ok: false } as RegisterResult),
  verifyRegister: async () => null,
  forgotPassword: async () => ({ ok: false } as CodeResult),
  resetPassword: async () => null,
  resendCode: async () => ({ ok: false } as CodeResult),
  logout: () => {},
  syncing: false,
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) return AUTH_STUB;
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
          // Валидируем сессию: если реального подтверждённого аккаунта в базе нет
          // (phantom — залогинен, но не завершил верификацию), разлогиниваем, чтобы
          // человек прошёл подтверждение. Разлогин ТОЛЬКО при явном exists:false
          // (не на сетевой ошибке — иначе выкинем при временном сбое).
          postAuth({ action: "check", email: parsed.email })
            .then((d) => {
              if (d && d.exists === false) {
                setUser(null);
                localStorage.removeItem("user");
              }
            })
            .catch(() => {});
          setSyncing(true);
          // Если данные в браузере принадлежат другому аккаунту (владелец ≠
          // текущий email) — стереть и загрузить только свои, не пушить чужое.
          const owner = getDataOwner();
          if (owner && owner !== parsed.email) {
            clearLocalProfile();
            loadFromServer(parsed.email).finally(() => setSyncing(false));
          } else {
            syncFromServer(parsed.email).finally(() => setSyncing(false));
          }
        }
      } catch {}
    }
  }, []);

  // Shared: persist the authenticated user, pull their server data, reflect it.
  //
  // КРИТИЧНО для изоляции профилей: если в браузере лежат данные ДРУГОГО
  // аккаунта (владелец localStorage-данных ≠ этот email, или ранее был залогинен
  // другой user), их надо СТЕРЕТЬ и загрузить только серверные данные нового
  // аккаунта. Иначе прошлый профиль (история, «год в кино», достижения) утекал в
  // новый: syncFromServer сначала пушил чужой localStorage на сервер под новую
  // почту, а /api/sync мержил — новый аккаунт наследовал чужое. Анонимные данные
  // (никто раньше не входил) при первой регистрации по-прежнему мигрируют.
  const completeAuth = async (u: User, reload: boolean) => {
    let prevUser: string | null = null;
    try { prevUser = JSON.parse(localStorage.getItem("user") || "null")?.email || null; } catch {}
    const owner = getDataOwner();
    const foreign = (!!owner && owner !== u.email) || (!!prevUser && prevUser !== u.email);

    setUser(u);
    localStorage.setItem("user", JSON.stringify(u));

    if (reload) {
      // Чужой аккаунт → стираем его данные СИНХРОННО перед reload (без await —
      // гонки с плеером нет, clearLocalProfile синхронный). Иначе, если owner не
      // был выставлен, mount-эффект свежей страницы уходил в ветку merge и история/
      // позиции/топ-5 прошлого (free) аккаунта утекали в новый (PRO): «Продолжить»
      // показывало чужой фильм и не ту серию. После очистки owner=null + пустой
      // локальный профиль → свежая страница загрузит ТОЛЬКО серверные данные PRO.
      if (foreign) clearLocalProfile();
      window.location.reload();
      return;
    }
    // reload=false (подтверждение регистрации): плеера в этот момент нет — можно
    // синхронно.
    setSyncing(true);
    if (foreign) {
      clearLocalProfile();          // чужой профиль — прочь
      await loadFromServer(u.email); // только загрузка, пушить нечего
    } else {
      await syncFromServer(u.email); // тот же юзер / аноним → миграция-мерж ок
    }
    setSyncing(false);
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
    // Стираем локальный профиль — иначе на общем ПК следующий залогинившийся
    // унаследует историю/достижения предыдущего (и утечёт в его аккаунт).
    clearLocalProfile();
    // Снимаем cookie гейта подписки — иначе на общем ПК следующий увидит Pro.
    try { document.cookie = "kino_sub=; path=/; max-age=0"; } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, login, register, verifyRegister, forgotPassword, resetPassword, resendCode, logout, syncing }}>
      {children}
    </AuthContext.Provider>
  );
}
