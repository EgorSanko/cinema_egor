"use client";

import { Home, Tv, Search, Grid3X3, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Нижняя панель на телефоне.
 *
 * Поиск стоит В ЦЕНТРЕ и выделен: до этого его вообще не было в панели —
 * чтобы что-то найти, приходилось открывать три полоски и искать поиск там.
 * Для кинотеатра это главное действие, ему и место главное.
 *
 * «Избранное» убрано: оно доступно из меню и с карточек, а место в панели
 * дороже. На месте удалённого «Вместе» (19.09.2026) теперь «Профиль»: панель
 * снова из пяти кнопок, а в профиль с телефона раньше можно было попасть
 * только через меню-гамбургер.
 */
const tabs = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/tv", icon: Tv, label: "Сериалы" },
  { href: "/search", icon: Search, label: "Поиск", главная: true },
  { href: "/collections", icon: Grid3X3, label: "Подборки" },
  { href: "/profile", icon: User, label: "Профиль" },
];

export function MobileNav() {
  const pathname = usePathname();

  // The /tv-* routes are the full-screen Android-TV UI — no site chrome there.
  if (pathname.startsWith("/tv-")) return null;

  return (
    <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border lg:hidden">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map(({ href, icon: Icon, label, главная }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          if (главная) {
            // Поиск — основное действие: иконка в заметном круге, чтобы палец
            // находил её не глядя.
            return (
              <Link key={href} href={href} aria-label={label}
                className="flex flex-col items-center gap-0.5 px-2 py-1 transition-all">
                <span
                  className={`grid place-items-center w-10 h-10 rounded-full transition-colors ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/15 text-primary ring-1 ring-primary/30"
                  }`}
                >
                  <Icon size={20} />
                </span>
                <span className={`text-[12px] font-semibold ${isActive ? "text-primary" : "text-foreground/70"}`}>
                  {label}
                </span>
              </Link>
            );
          }
          return (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}>
              <Icon size={20} className={isActive ? "text-primary" : ""} />
              <span className="text-[12px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area padding for phones with gesture bars */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
