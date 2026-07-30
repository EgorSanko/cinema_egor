"use client";

import { Navbar } from "@/components/navbar";
import { useState, useEffect } from "react";
import Link from "next/link";
import { invalidateSubscription } from "@/hooks/use-subscription";
import {
  Crown, Check, X, Zap, Download, Users, Radio, Sparkles,
  AudioLines, Ban, ShieldCheck, ChevronDown, Gauge, Clapperboard, Loader2,
} from "lucide-react";
import { useAuth } from "@/components/auth-context";
import { useSubscription } from "@/hooks/use-subscription";
import { PLANS as PLAN_DATA } from "@/lib/plans";

/**
 * Страница подписки «Про» (/pro). Источники НЕ называем — только пользовательская
 * ценность (без рекламы, макс. качество, все озвучки, «Вместе», спорт).
 * Скачивание из описания УБРАНО (2026-07-30): фича выключена (DOWNLOADS_UP),
 * нельзя обещать в подписке то, чего нет. Тарифы по срокам с выгодой — как у kino.pub. Оплата пока не подключена
 * («пока оформить»): кнопка показывает статус «скоро», реальный чекаут добавим,
 * когда выберем платёжный агрегатор.
 */

// Тарифы — из общего lib/plans (единый источник цен с сервером).
const PLANS = PLAN_DATA;

const FEATURES: { Icon: any; title: string; desc: string }[] = [
  { Icon: Ban, title: "Без рекламы", desc: "Ни баннеров, ни пре-роллов, ни пауз. Только фильм — сразу с первой секунды." },
  { Icon: Gauge, title: "Максимальное качество", desc: "До 4K Ultra HD там, где доступно. Чёткая картинка на любом экране." },
  { Icon: AudioLines, title: "Все озвучки и субтитры", desc: "Полный набор дорожек. Переключение мгновенное — без перезагрузки видео." },
  { Icon: Clapperboard, title: "Наш плеер", desc: "Продолжить с любого места, история просмотра, авто-скип заставок и титров." },
  { Icon: Users, title: "Совместный просмотр", desc: "«Вместе» — синхронный просмотр с друзьями в одной комнате и общий чат." },
  { Icon: Radio, title: "Спортивные каналы", desc: "Прямые эфиры в HD и 4K — матчи и турниры без задержек." },
  { Icon: Sparkles, title: "Ранний доступ", desc: "Новые функции раньше всех и приоритетная поддержка в любой момент." },
];

const COMPARE: { label: string; free: boolean | string; pro: boolean | string }[] = [
  { label: "Каталог фильмов и сериалов", free: true, pro: true },
  { label: "Реклама в плеере", free: "Есть", pro: "Нет" },
  { label: "Качество", free: "до 1080p", pro: "до 4K" },
  { label: "Все озвучки, мгновенное переключение", free: false, pro: true },
  { label: "Наш плеер: история, продолжить, скип", free: false, pro: true },
  { label: "Совместный просмотр «Вместе»", free: false, pro: true },
  { label: "Спортивные каналы в эфире", free: false, pro: true },
  { label: "Приоритетная поддержка", free: false, pro: true },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Как оплатить?", a: "Нажми «Оформить» — откроется наш Telegram-бот. Привяжи аккаунт одной кнопкой и оплати картой или криптовалютой через защищённый сервис. Доступ включится автоматически за минуту." },
  { q: "Как работает продление?", a: "Подписка разовая — на 1 месяц. Автосписаний нет: по истечении месяца доступ просто заканчивается. Захочешь дальше — оплатишь ещё месяц вручную." },
  { q: "На скольких устройствах работает?", a: "На всех — телефон, планшет, компьютер, ТВ. Один аккаунт, никаких ограничений по количеству устройств." },
  { q: "А если нужного фильма нет?", a: "Каталог постоянно расширяется. Если чего-то не хватает — напиши нам, и мы постараемся добавить." },
];

export default function ProPage() {
  const { user } = useAuth();
  const { isPro, until } = useSubscription();
  const [selected, setSelected] = useState("1m");
  const [notice, setNotice] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const plan = PLANS.find((p) => p.id === selected)!;
  const perMonth = Math.round(plan.price / plan.months);

  const [confirming, setConfirming] = useState(false);
  const [paidOk, setPaidOk] = useState(false);

  const checkout = async () => {
    if (!user?.email) {
      setNotice("Войдите в аккаунт (кнопка «Моё» вверху), чтобы оформить подписку.");
      return;
    }
    setPaying(true);
    setNotice(null);
    try {
      // Оплата через Tribute-мост: открываем нашего Telegram-бота со связкой
      // аккаунта (короткий id → почта). Бот привяжет Telegram и даст ссылку на
      // оплату. После оплаты (вступление в PRO-канал) подписка включится сама.
      const r = await fetch(`/api/tribute/paylink?email=${encodeURIComponent(user.email)}`);
      const d = await r.json();
      if (d.ok && d.botUrl) {
        // Прямая навигация (не window.open) — иначе браузер блокирует открытие
        // окна после await (потерян user-gesture). t.me-ссылку Telegram сам
        // перехватит и откроет бота — и в обычном браузере, и внутри TG.
        window.location.href = d.botUrl;
        return;
      }
      setNotice(d.error || "Не удалось создать ссылку на оплату. Попробуйте позже.");
    } catch {
      setNotice("Ошибка сети. Попробуйте ещё раз.");
    } finally {
      setPaying(false);
    }
  };

  // Возврат с оплаты (?paid=1): подтверждаем платёж по сохранённому id и
  // активируем подписку (не дожидаясь вебхука).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("paid") !== "1") return;
    let pid = "";
    try { pid = localStorage.getItem("kino_pending_payment") || ""; } catch {}
    if (!pid) return;
    setConfirming(true);
    fetch("/api/pay/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentId: pid }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && d.active) {
          try { localStorage.removeItem("kino_pending_payment"); } catch {}
          invalidateSubscription();
          setPaidOk(true);
          // Обновим статус подписки во всём приложении.
          window.dispatchEvent(new Event("kino-source-changed"));
          setTimeout(() => { window.location.href = "/"; }, 2500);
        } else {
          setNotice(d.pending ? "Платёж ещё обрабатывается — обнови страницу через минуту." : "Оплата не подтверждена. Если деньги списаны — напиши в поддержку.");
        }
      })
      .catch(() => setNotice("Не удалось проверить оплату. Обнови страницу."))
      .finally(() => setConfirming(false));
  }, []);

  return (
    <>
      <style jsx global>{`
        @keyframes pro-fog { 0%,100%{transform:translate(0,0) scale(1)} 50%{transform:translate(30px,-18px) scale(1.1)} }
        @keyframes pro-shine { 0%{transform:translateX(-120%)} 100%{transform:translateX(220%)} }
        .pro-fog{animation:pro-fog 20s ease-in-out infinite}
        .pro-cta::after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,transparent 30%,rgba(255,255,255,.25) 50%,transparent 70%);transform:translateX(-120%)}
        .pro-cta:hover::after{animation:pro-shine 1.1s ease-out forwards}
      `}</style>

      <Navbar />
      {(confirming || paidOk) && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] rounded-xl px-5 py-3 bg-primary text-primary-foreground font-bold text-[14px] shadow-2xl flex items-center gap-2.5"
          style={{ boxShadow: "0 10px 40px -6px rgba(163,230,53,0.6)" }}>
          {confirming ? (<><Loader2 size={17} className="animate-spin" /> Проверяем оплату…</>) : (<><Crown size={17} /> Оплата прошла! Про активна 🎉</>)}
        </div>
      )}
      <main className="relative min-h-screen bg-background pb-24 sm:pb-16 overflow-hidden">
        {/* Ambient glow */}
        <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
          <div className="pro-fog absolute -top-40 -right-24 w-[620px] h-[620px] rounded-full bg-primary/[0.14] blur-3xl" />
          <div className="pro-fog absolute -bottom-40 -left-24 w-[520px] h-[520px] rounded-full bg-amber-400/[0.07] blur-3xl" style={{ animationDelay: "-10s" }} />
        </div>

        {/* ── Hero ─────────────────────────────────────────────── */}
        <section className="relative max-w-5xl mx-auto px-4 sm:px-6 pt-12 sm:pt-16 pb-8 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 h-8 rounded-full bg-gradient-to-r from-amber-400/15 to-primary/20 ring-1 ring-primary/40 text-primary text-[12px] font-bold tracking-wider uppercase">
            <Crown size={13} /> sapkeflykino Про
          </div>
          <h1 className="mt-5 text-4xl sm:text-6xl font-black text-foreground tracking-tight leading-[1.05]">
            Смотри без рекламы <br className="hidden sm:block" />
            <span className="bg-gradient-to-r from-primary to-lime-200 bg-clip-text text-transparent">и без ограничений</span>
          </h1>
          <p className="mt-4 text-foreground/60 text-[15px] sm:text-lg max-w-2xl mx-auto leading-relaxed">
            Максимальное качество, все озвучки, совместный просмотр и спортивные
            каналы — в одной подписке на месяц. Без автосписаний.
          </p>
          {isPro && until && (
            <div className="mt-6 inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-primary/12 ring-1 ring-primary/30 text-primary font-bold text-[15px]">
              <Crown size={18} />
              <span>Твоя подписка Про активна до {new Date(until).toLocaleDateString("ru-RU")}</span>
            </div>
          )}
          <a href="#plans" className="mt-7 inline-flex items-center gap-2 h-12 px-7 rounded-full bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 transition-colors"
            style={{ boxShadow: "0 8px 30px -6px rgba(163,230,53,0.5)" }}>
            {isPro ? "Продлить Про" : "Оформить Про"} <Zap size={17} fill="currentColor" />
          </a>
          <p className="mt-3 text-foreground/40 text-[12.5px]">{PLANS[0].price} ₽ в месяц · без длинных обязательств</p>
        </section>

        {/* ── Features grid ────────────────────────────────────── */}
        <section className="relative max-w-6xl mx-auto px-4 sm:px-6 mt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {FEATURES.map(({ Icon, title, desc }) => (
              <div key={title} className="relative rounded-2xl p-5 bg-foreground/[0.03] ring-1 ring-white/[0.06] hover:ring-primary/25 transition-colors overflow-hidden group">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" style={{ boxShadow: "inset 0 0 40px rgba(163,230,53,0.08)" }} />
                <div className="relative w-11 h-11 rounded-xl bg-primary/12 ring-1 ring-primary/25 flex items-center justify-center text-primary mb-3.5" style={{ boxShadow: "0 0 18px rgba(163,230,53,0.16)" }}>
                  <Icon size={20} />
                </div>
                <h3 className="relative text-[15px] font-bold text-foreground">{title}</h3>
                <p className="relative text-foreground/55 text-[12.5px] mt-1 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Plans ────────────────────────────────────────────── */}
        <section id="plans" className="relative max-w-5xl mx-auto px-4 sm:px-6 mt-14 sm:mt-20 scroll-mt-20">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground text-center">Подписка Про</h2>
          <p className="text-foreground/55 text-center text-[14px] mt-2">Всё Про за {plan.price} ₽ в месяц. Продлеваешь когда захочешь — без длинных обязательств.</p>

          {/* Единый тариф — 1 месяц */}
          <div className="mt-8 mx-auto max-w-sm rounded-2xl p-6 border-2 border-primary bg-primary/[0.08] text-center"
            style={{ boxShadow: "0 10px 34px -12px rgba(163,230,53,0.45)" }}>
            <div className="text-foreground/70 font-semibold text-[14px]">Про — {plan.label}</div>
            <div className="mt-2 flex items-baseline justify-center gap-1">
              <span className="text-5xl font-black text-foreground tabular-nums">{plan.price}</span>
              <span className="text-foreground/60 text-lg font-semibold">₽ / мес</span>
            </div>
            <div className="text-foreground/45 text-[12px] mt-2">Все возможности Про · картой или через СБП</div>
          </div>

          {/* CTA */}
          <div className="mt-7 rounded-2xl p-5 sm:p-6 bg-gradient-to-br from-primary/[0.10] via-primary/[0.03] to-transparent ring-1 ring-primary/20 flex flex-col sm:flex-row items-center gap-4 justify-between">
            <div className="text-center sm:text-left">
              <div className="text-foreground font-bold text-[16px]">
                {isPro ? "Продлить Про ещё на месяц" : "Оформить Про"} — {plan.price} ₽
              </div>
              <div className="text-foreground/55 text-[12.5px] mt-0.5">
                Подписка на 1 месяц · без автосписаний
              </div>
            </div>
            <button
              onClick={checkout}
              disabled={paying}
              className="pro-cta relative overflow-hidden inline-flex items-center gap-2 h-12 px-7 rounded-full bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 transition-colors flex-shrink-0 disabled:opacity-70"
              style={{ boxShadow: "0 8px 28px -6px rgba(163,230,53,0.5)" }}
            >
              {paying ? <Loader2 size={17} className="animate-spin" /> : <Crown size={17} />}
              {paying ? "Создаём платёж…" : "Оформить"}
            </button>
          </div>

          {isPro && until && (
            <div className="mt-3 rounded-xl px-4 py-3 bg-primary/[0.08] ring-1 ring-primary/25 text-primary/90 text-[13px] flex items-center gap-2.5">
              <Crown size={16} className="flex-shrink-0 text-primary" />
              <span>Подписка Про активна до {new Date(until).toLocaleDateString("ru-RU")}. Оплата продлит срок.</span>
            </div>
          )}
          {notice && (
            <div className="mt-3 rounded-xl px-4 py-3 bg-amber-400/[0.08] ring-1 ring-amber-400/25 text-amber-200/90 text-[13px] flex items-start gap-2.5">
              <ShieldCheck size={16} className="flex-shrink-0 mt-0.5 text-amber-300" />
              <span>{notice}</span>
            </div>
          )}
        </section>

        {/* ── Free vs Pro ──────────────────────────────────────── */}
        <section className="relative max-w-3xl mx-auto px-4 sm:px-6 mt-14 sm:mt-20">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground text-center">Бесплатно и Про</h2>
          <div className="mt-7 rounded-2xl overflow-hidden ring-1 ring-white/[0.07]">
            <div className="grid grid-cols-[1fr_auto_auto] bg-foreground/[0.04] text-[12px] font-bold uppercase tracking-wider text-foreground/60">
              <div className="px-4 py-3">Возможность</div>
              <div className="px-4 py-3 text-center w-20">Free</div>
              <div className="px-4 py-3 text-center w-20 text-primary">Про</div>
            </div>
            {COMPARE.map((row, i) => (
              <div key={row.label} className={"grid grid-cols-[1fr_auto_auto] items-center text-[13px] " + (i % 2 ? "bg-foreground/[0.015]" : "")}>
                <div className="px-4 py-3 text-foreground/85">{row.label}</div>
                <div className="px-4 py-3 text-center w-20"><Cell v={row.free} /></div>
                <div className="px-4 py-3 text-center w-20 bg-primary/[0.05]"><Cell v={row.pro} pro /></div>
              </div>
            ))}
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────── */}
        <section className="relative max-w-3xl mx-auto px-4 sm:px-6 mt-14 sm:mt-20">
          <h2 className="text-2xl sm:text-3xl font-black text-foreground text-center">Вопросы</h2>
          <div className="mt-7 space-y-2.5">
            {FAQ.map((f, i) => {
              const open = openFaq === i;
              return (
                <div key={i} className="rounded-xl bg-foreground/[0.03] ring-1 ring-white/[0.06] overflow-hidden">
                  <button onClick={() => setOpenFaq(open ? null : i)} className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left">
                    <span className="text-foreground font-semibold text-[14px]">{f.q}</span>
                    <ChevronDown size={17} className={"text-foreground/50 flex-shrink-0 transition-transform " + (open ? "rotate-180" : "")} />
                  </button>
                  {open && <p className="px-4 pb-4 -mt-1 text-foreground/60 text-[13px] leading-relaxed">{f.a}</p>}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Bottom CTA ───────────────────────────────────────── */}
        <section className="relative max-w-3xl mx-auto px-4 sm:px-6 mt-14 sm:mt-20 text-center">
          <div className="rounded-3xl p-8 sm:p-10 bg-gradient-to-br from-primary/[0.12] via-primary/[0.04] to-transparent ring-1 ring-primary/25">
            <Crown size={30} className="mx-auto text-primary" />
            <h2 className="mt-4 text-2xl sm:text-3xl font-black text-foreground">Готов смотреть без рекламы?</h2>
            <p className="mt-2 text-foreground/60 text-[14px] max-w-md mx-auto">
              Оформи Про и получи всё лучшее сразу. Без обязательств — отписаться можно в любой момент.
            </p>
            <a href="#plans" className="mt-6 inline-flex items-center gap-2 h-12 px-8 rounded-full bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 transition-colors"
              style={{ boxShadow: "0 8px 30px -6px rgba(163,230,53,0.5)" }}>
              Выбрать тариф <Zap size={17} fill="currentColor" />
            </a>
          </div>
          <Link href="/" className="inline-block mt-6 text-foreground/45 hover:text-foreground/70 text-[13px] transition-colors">
            ← Продолжить бесплатно
          </Link>
        </section>
      </main>
    </>
  );
}

function Cell({ v, pro }: { v: boolean | string; pro?: boolean }) {
  if (v === true) return <Check size={17} className={"inline " + (pro ? "text-primary" : "text-foreground/70")} />;
  if (v === false) return <X size={16} className="inline text-foreground/25" />;
  return <span className={"text-[12px] font-semibold " + (pro ? "text-primary" : "text-foreground/60")}>{v}</span>;
}
