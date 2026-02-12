// === КУДА ПОЛОЖИТЬ: app/tv-app/layout.tsx ===
// Отдельный layout для TV-режима — без navbar и mobile-nav
import type React from "react";

export const metadata = {
  title: "Кинотеатр Егора — TV",
  description: "Смотрите фильмы на большом экране с пульта",
};

export default function TVLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
