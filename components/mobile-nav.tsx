"use client";

import { Home, Tv, Heart, Clock, Grid3X3 } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/", icon: Home, label: "Главная" },
  { href: "/tv", icon: Tv, label: "Сериалы" },
  { href: "/collections", icon: Grid3X3, label: "Подборки" },
  { href: "/favorites", icon: Heart, label: "Избранное" },
  { href: "/history", icon: Clock, label: "История" },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-lg border-t border-border sm:hidden">
      <div className="flex items-center justify-around h-16 px-1">
        {tabs.map(({ href, icon: Icon, label }) => {
          const isActive = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link key={href} href={href}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg transition-all ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}>
              <Icon size={20} className={isActive ? "text-primary" : ""} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </div>
      {/* Safe area padding for phones with gesture bars */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
