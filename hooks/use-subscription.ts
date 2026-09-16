"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-context";

// Статус подписки текущего юзера. Лёгкий модульный кэш (60с) — навбар/профиль/
// плеер дёргают один эндпоинт, но фактически ходим раз в минуту на email.
let cache: { email: string; active: boolean; until: number | null; plan: string | null; at: number } | null = null;

export type SubState = { isPro: boolean; until: number | null; plan: string | null; loading: boolean };

type Resolved = { email: string; active: boolean; until: number | null; plan: string | null };

export function useSubscription(): SubState {
  const { user } = useAuth();
  const email = (user?.email || "").toLowerCase();

  // Храним РАЗРЕШЁННЫЙ результат вместе с email, для которого он получен.
  const [resolved, setResolved] = useState<Resolved | null>(
    cache && Date.now() - cache.at < 60_000
      ? { email: cache.email, active: cache.active, until: cache.until, plan: cache.plan }
      : null,
  );

  useEffect(() => {
    if (!email) { setResolved({ email: "", active: false, until: null, plan: null }); return; }
    if (cache && cache.email === email && Date.now() - cache.at < 60_000) {
      setResolved({ email, active: cache.active, until: cache.until, plan: cache.plan });
      return;
    }
    let cancelled = false;
    fetch(`/api/subscription?email=${encodeURIComponent(email)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        cache = { email, active: !!d.active, until: d.until ?? null, plan: d.plan ?? null, at: Date.now() };
        setResolved({ email, active: !!d.active, until: d.until ?? null, plan: d.plan ?? null });
        window.dispatchEvent(new Event("subscription-loaded"));
      })
      .catch(() => { if (!cancelled) setResolved({ email, active: false, until: null, plan: null }); });
    return () => { cancelled = true; };
  }, [email]);

  // КЛЮЧЕВОЕ: loading вычисляется деривативно — есть ли результат ИМЕННО для
  // текущего email. Пока не совпало (user только прогрузился, идёт запрос) →
  // loading:true, isPro:false. Это убирает одно-рендерное отставание useState,
  // из-за которого энфорсер понижал источник Про-юзера на стейл-значении.
  const matches = !!resolved && resolved.email === email;
  return {
    isPro: matches ? resolved!.active : false,
    until: matches ? resolved!.until : null,
    plan: matches ? resolved!.plan : null,
    loading: !!email && !matches,
  };
}

// Сбросить кэш (после оплаты/выхода) — заставит перезапросить статус.
export function invalidateSubscription() {
  cache = null;
}
