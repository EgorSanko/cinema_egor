"use client";

import { Home, Tv, Heart, Clock, Grid3X3, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getSource } from "@/lib/kinopub";

const tabs = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/tv", icon: Tv, label: "Сериалы" },
  { href: "/watch", icon: Users, label: "Вместе" },
  { href: "/collections", icon: Grid3X3, label: "Подборки" },
  { href: "/favorites", icon: Heart, label: "Избранное" },
];

export function MobileNav() {
  const pathname = usePathname();
  // «Вместе» (совместный просмотр в нашем плеере) недоступно на zenithjs (чужой
  // iframe) — прячем таб на бесплатном источнике.
  const [hideWatch, setHideWatch] = useState(true); // free по умолчанию → без флеша «Вместе»
  useEffect(() => {
    const check = () => setHideWatch(getSource() === "zenithjs");
    check();
    window.addEventListener("storage", check);
    window.addEventListener("kino-source-changed", check);
    return () => { window.removeEventListener("storage", check); window.removeEventListener("kino-source-changed", check); };
  }, []);
  const visibleTabs = hideWatch ? tabs.filter((t) => t.href !== "/watch") : tabs;

  // The /tv-* routes are the full-screen Android-TV UI — no site chrome there.
  if (pathname.startsWith("/tv-")) return null;

  // Hide on watch room pages (not /watch or /watch/create)
  if (pathname.match(/^\/watch\/[A-Z0-9]{4,}$/i)) return null;

  return (
    <nav className="mobile-bottom-nav fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border lg:hidden">
      <div className="flex items-center justify-around h-16 px-1">
        {visibleTabs.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
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
