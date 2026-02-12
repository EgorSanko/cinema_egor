"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { syncFromServer } from "@/lib/storage";

interface User {
  email: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<string | null>;
  register: (name: string, email: string, password: string) => Promise<string | null>;
  logout: () => void;
  syncing: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
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
        // Auto-sync on page load if logged in
        if (parsed?.email) {
          setSyncing(true);
          syncFromServer(parsed.email).finally(() => setSyncing(false));
        }
      } catch {}
    }
  }, []);

  const login = async (email: string, password: string): Promise<string | null> => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "login", email, password }),
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
      // Sync data from server after login
      setSyncing(true);
      await syncFromServer(data.user.email);
      setSyncing(false);
      // Reload to reflect synced data
      window.location.reload();
      return null;
    }
    return data.error;
  };

  const register = async (name: string, email: string, password: string): Promise<string | null> => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "register", name, email, password }),
    });
    const data = await res.json();
    if (data.success) {
      setUser(data.user);
      localStorage.setItem("user", JSON.stringify(data.user));
      // Sync local data to server for new user
      setSyncing(true);
      await syncFromServer(data.user.email);
      setSyncing(false);
      return null;
    }
    return data.error;
  };

  const logout = () => {
    // Save to server before logout
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
      // Fire and forget
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
    <AuthContext.Provider value={{ user, login, register, logout, syncing }}>
      {children}
    </AuthContext.Provider>
  );
}
