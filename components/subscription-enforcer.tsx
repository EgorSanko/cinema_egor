"use client";

import { useEffect, useRef } from "react";
import { useSubscription, invalidateSubscription } from "@/hooks/use-subscription";
import { useAuth } from "@/components/auth-context";
import { getSource, setSource, HDREZKA_UP, ALLOHA_UP } from "@/lib/kinopub";

// Приводит источник в соответствие с тарифом (монтируется глобально в layout):
//  • Free (нет подписки) → источник ВСЕГДА zenithjs (даже если в localStorage
//    остался hdrezka/kinopub от прошлой подписки). Переключать в профиле нельзя.
//  • Pro → при первом Pro-заходе авто-переключаем на HDRezka (лучшее качество),
//    дальше юзер волен менять сам. Флаг, чтобы не перебивать его выбор.
// Настоящая защита потока — серверный гейт (следующая фаза); это UX-слой.
const PRO_DEFAULT_FLAG = "kino_pro_default_v1";

export function SubscriptionEnforcer() {
  const { isPro, loading } = useSubscription();
  const { user } = useAuth();

  // Глобальное подтверждение оплаты: если есть незакрытый платёж (сохранён при
  // клике «Оформить»), подтверждаем на ЛЮБОЙ странице сразу — чтобы юзер не видел
  // FREE после оплаты, даже если вернулся не на /pro. Ретраи — на случай, если
  // платёж ещё «pending» пару секунд. На /pro не дёргаем (там свой обработчик с
  // баннером). Активировалось → перезагружаем, чтобы Про отразилось везде.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.location.pathname === "/pro") return;
    let pid = "";
    try { pid = localStorage.getItem("kino_pending_payment") || ""; } catch {}
    if (!pid) return;
    let tries = 0;
    let stop = false;
    const attempt = () => {
      if (stop) return;
      tries++;
      fetch("/api/pay/confirm", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ paymentId: pid }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.ok && d.active) {
            try { localStorage.removeItem("kino_pending_payment"); } catch {}
            invalidateSubscription();
            stop = true;
            window.location.reload();
          } else if (d.pending && tries < 6) {
            setTimeout(attempt, 4000); // платёж ещё обрабатывается — повторим
          } else if (tries >= 6) {
            // не подтвердилось за ~24с — оставляем крону/след. заходу
            stop = true;
          }
        })
        .catch(() => { if (tries < 6) setTimeout(attempt, 4000); });
    };
    attempt();
    return () => { stop = true; };
  }, []);

  // Был ли юзер Pro в ЭТОЙ сессии. Если да — больше НЕ понижаем его на Free, даже
  // если isPro на миг мигнёт false (транзиентный ре-фетч подписки/кэш). Это и был
  // баг «на новой серии Pro-плеер слетает на Free» — энфорсер сбрасывал источник
  // на zenithjs при мгновенном isPro=false.
  const wasPro = useRef(false);
  useEffect(() => {
    // КРИТИЧНО: ждём загрузки юзера. До гидрации auth-context user=null, а
    // useSubscription при пустом email отдаёт {isPro:false, loading:false} —
    // и энфорсер ошибочно принимал Про-юзера за free и сбрасывал его источник
    // (kinopub/alloha → zenithjs → потом форс hdrezka = «перескок на Плеер 1»).
    // Нет юзера → не трогаем; залогинится/прогрузится → отработаем корректно.
    if (!user) return;
    if (loading) return;
    const cur = getSource();
    if (isPro) {
      wasPro.current = true;
      // Pro НИКОГДА не должен сидеть на zenithjs — это бесплатный источник, его
      // даже нет в переключателе → «ни один плеер не выбран» + бесплатный плеер.
      // Баг (переход из ТГ-канала в свежем контексте / с уже выставленным флагом):
      // cur=zenithjs у Про не поднимался, т.к. bump был ЗА флагом. Теперь
      // поднимаем ВСЕГДА (zenithjs или недоступный hdrezka → alloha). Явный
      // Pro-выбор (kinopub/alloha/…) не трогаем.
      // Alloha скрыта (ALLOHA_UP=false) → Pro уводим на kino.pub.
      const proDefault = HDREZKA_UP ? "hdrezka" : ALLOHA_UP ? "alloha" : "kinopub";
      if (
        cur === "zenithjs" ||
        (cur === "hdrezka" && !HDREZKA_UP) ||
        (cur === "alloha" && !ALLOHA_UP)
      ) {
        setSource(proDefault);
      }
      try { localStorage.setItem(PRO_DEFAULT_FLAG, "1"); } catch {}
    } else {
      // Уже был Pro в этой сессии → транзиент, НЕ понижаем.
      if (wasPro.current) return;
      // Настоящий free — источник ВСЕГДА alloha (бесплатный плеер с пре-роллом).
      // Раньше был zenithjs (Collaps); теперь free = Alloha + реклама.
      try { localStorage.removeItem(PRO_DEFAULT_FLAG); } catch {}
      // Alloha скрыта → free тоже на kino.pub. Collaps (zenithjs) у нас не
      // используется как плеер вообще (решение Егора), поэтому уводить туда нельзя.
      const freeDefault = ALLOHA_UP ? "alloha" : "kinopub";
      if (cur !== freeDefault) setSource(freeDefault);
    }
  }, [isPro, loading, user]);

  return null;
}
