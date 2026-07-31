"use client";

import Link from "next/link";
import { Crown, Check, ArrowRight } from "lucide-react";

/**
 * Апселл под бесплатным (zenithjs) плеером: пропозиция перейти на Про.
 * Показывать только когда источник = zenithjs (free). Кнопка ведёт в профиль —
 * когда появится чекаут подписки, перенаправим её на оплату.
 */
const FEATURES = [
  "Без рекламы и пропусков",
  "Наш плеер: продолжить просмотр, история, скип заставок",
  "Максимальное качество до 4K и все озвучки — переключение мгновенно",
  "Скачивание фильмов и серий",
  "Совместный просмотр «Вместе» с друзьями",
  "Спортивные каналы в прямом эфире",
];

export function ProUpsell() {
  return (
    <div className="mt-4 rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.10] via-primary/[0.03] to-transparent p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="hidden sm:flex w-11 h-11 rounded-xl bg-primary/15 ring-1 ring-primary/30 items-center justify-center text-primary flex-shrink-0">
          <Crown size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-bold text-foreground">
            Хочешь смотреть без рекламы?
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Сейчас ты на бесплатной версии. Оформи <span className="text-primary font-semibold">Про</span> и получи:
          </p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-5 gap-y-1.5">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-[13px] text-foreground/85">
                <Check size={15} className="text-primary flex-shrink-0 mt-0.5" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/pro"
            className="inline-flex items-center gap-2 mt-4 h-11 px-5 rounded-full bg-primary text-primary-foreground font-bold text-[14px] hover:bg-primary/90 transition-colors"
          >
            Перейти на Про <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </div>
  );
}
