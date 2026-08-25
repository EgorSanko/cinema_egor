
import { useEffect, useState } from "react";
import { getTvUser } from "@/lib/tv-auth";

// Pro-статус для ТВ-экранов. Они рендерятся ВНЕ <AuthProvider> (см. lib/tv-auth),
// поэтому useSubscription/useAuth здесь не работают. Читаем email из getTvUser и
// спрашиваем ТОТ ЖЕ /api/subscription. Лёгкий модульный кэш 60с — чтобы домашняя,
// вкладка Спорт и плеер не долбили эндпоинт по отдельности.
let cache: { email: string; active: boolean; at: number } | null = null;

export function useTvPro(): { isPro: boolean; loading: boolean; email: string } {
  const [state, setState] = useState<{ isPro: boolean; loading: boolean; email: string }>(
    { isPro: false, loading: true, email: "" }
  );

  useEffect(() => {
    const u = getTvUser();
    const email = (u?.email || "").toLowerCase();
    if (!email) { setState({ isPro: false, loading: false, email: "" }); return; }
    if (cache && cache.email === email && Date.now() - cache.at < 60_000) {
      setState({ isPro: cache.active, loading: false, email });
      return;
    }
    let cancelled = false;
    fetch(`/api/subscription?email=${encodeURIComponent(email)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        cache = { email, active: !!d.active, at: Date.now() };
        setState({ isPro: !!d.active, loading: false, email });
      })
      .catch(() => { if (!cancelled) setState({ isPro: false, loading: false, email }); });
    return () => { cancelled = true; };
  }, []);

  return state;
}

export function invalidateTvPro() { cache = null; }
