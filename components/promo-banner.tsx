"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/components/auth-context";

/**
 * Полоса с подарочным PRO.
 *
 * Смысл акции не в самой неделе, а в её последних днях: пока человек просто
 * смотрит без рекламы, он ничего не собирается платить. Поэтому за двое суток
 * до конца полоса меняет тон — говорит, что подарок заканчивается и реклама
 * вернётся, и ведёт на оплату. Без этого люди не замечают, что у них что-то
 * забрали, и не идут покупать.
 *
 * На ТВ-экранах не показываем: там колонка ровно в высоту кадра, лишняя полоса
 * сверху ломает раскладку, а нажать на неё пультом всё равно нельзя.
 */
const ТВ_ЭКРАНЫ = ["/tv-home", "/tv-login", "/tv-search", "/tv-watch"];
const СУТКИ = 24 * 3600 * 1000;

type Акция = { идёт: boolean; конец: number | null; повод: string };

function склонение(n: number, формы: [string, string, string]) {
  const д = n % 10, с = n % 100;
  if (д === 1 && с !== 11) return формы[0];
  if (д >= 2 && д <= 4 && (с < 10 || с >= 20)) return формы[1];
  return формы[2];
}

function осталось(до: number) {
  const мс = до - Date.now();
  if (мс <= 0) return "";
  const дней = Math.floor(мс / СУТКИ);
  if (дней >= 1) return `${дней} ${склонение(дней, ["день", "дня", "дней"])}`;
  const часов = Math.max(1, Math.floor(мс / 3600_000));
  return `${часов} ${склонение(часов, ["час", "часа", "часов"])}`;
}

export function PromoBanner() {
  const путь = usePathname() || "";
  const { user } = useAuth();
  const { isPro, until, plan, loading } = useSubscription();
  const [акция, setАкция] = useState<Акция | null>(null);
  const [закрыт, setЗакрыт] = useState(false);

  useEffect(() => {
    fetch("/api/promo", { cache: "no-store" })
      .then((r) => r.json())
      .then(setАкция)
      .catch(() => setАкция(null));
  }, []);

  // Закрытие помним на сутки, чтобы полоса не мозолила глаза весь день, но и
  // не исчезала навсегда — иначе про конец подарка человек не узнает.
  useEffect(() => {
    try {
      const до = Number(localStorage.getItem("kino_promo_hidden") || 0);
      if (до > Date.now()) setЗакрыт(true);
    } catch {}
  }, []);

  if (ТВ_ЭКРАНЫ.some((п) => путь === п || путь.startsWith(п + "/"))) return null;
  if (путь.startsWith("/pro")) return null;   // там и так всё написано
  if (закрыт || loading || !акция?.идёт) return null;

  const подарочный = plan === "promo" || plan === "trial";
  const конец = подарочный && until ? until : акция.конец;
  if (!конец) return null;

  const скороКонец = конец - Date.now() <= 2 * СУТКИ;
  const строка = осталось(конец);

  const спрятать = () => {
    setЗакрыт(true);
    try { localStorage.setItem("kino_promo_hidden", String(Date.now() + СУТКИ)); } catch {}
  };

  return (
    <div
      className={
        "w-full border-b " +
        (скороКонец
          ? "bg-amber-400/10 border-amber-400/25"
          : "bg-primary/10 border-primary/25")
      }
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-2.5 flex items-center justify-center gap-3 text-[13px] sm:text-sm">
        <p className={skoroClass(скороКонец)}>
          {!user ? (
            <>
              <b>{акция.повод}</b> — PRO бесплатно для всех, осталось {строка}.{" "}
              <span className="opacity-80">Войдите, чтобы включить.</span>
            </>
          ) : скороКонец ? (
            <>
              <b>Подарочный PRO заканчивается</b> через {строка} — потом вернётся реклама.
            </>
          ) : (
            <>
              <b>{акция.повод}</b> — у вас включён PRO без рекламы, осталось {строка}.
            </>
          )}
        </p>
        {user && (
          <Link
            href="/pro"
            className="shrink-0 rounded-full bg-primary text-primary-foreground px-3 py-1 text-[12px] font-semibold hover:opacity-90"
          >
            {скороКонец ? "Продлить" : "Что входит"}
          </Link>
        )}
        <button
          type="button"
          onClick={спрятать}
          aria-label="Скрыть"
          className="shrink-0 text-foreground/40 hover:text-foreground/70 text-lg leading-none px-1"
        >
          ×
        </button>
      </div>
    </div>
  );
}

function skoroClass(скоро: boolean) {
  return скоро ? "text-amber-200/90" : "text-foreground/80";
}
