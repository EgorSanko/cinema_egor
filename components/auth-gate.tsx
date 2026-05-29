"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthModal } from "./auth-modal";
import { useAuth } from "./auth-context";

/**
 * Auth gate — central modal listener mounted once in the root layout.
 *
 * Any component can require auth without owning modal state by calling
 * `useAuthGate()` and invoking the returned guard:
 *
 *   const requireAuth = useAuthGate();
 *   const onClick = () => {
 *     if (!requireAuth("Войдите, чтобы смотреть фильм")) return;
 *     play();
 *   };
 *
 * The guard returns true if the user is logged in (action proceeds). Otherwise
 * it dispatches `auth:gate-open` with the reason message, returns false, and
 * this component opens the login/register modal. After login AuthProvider
 * reloads the page, so the user lands back on the same URL already
 * authenticated and clicks again. One extra tap, no callback gymnastics.
 */

const EVENT = "auth:gate-open";

interface GateDetail { reason?: string }

export function AuthGate() {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string | undefined>();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<GateDetail>).detail;
      setReason(detail?.reason);
      setOpen(true);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);

  return <AuthModal isOpen={open} onClose={() => setOpen(false)} reason={reason} />;
}

export function useAuthGate(): (reason?: string) => boolean {
  const { user } = useAuth();
  return useCallback(
    (reason?: string) => {
      if (user) return true;
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent<GateDetail>(EVENT, { detail: { reason } }));
      }
      return false;
    },
    [user]
  );
}
