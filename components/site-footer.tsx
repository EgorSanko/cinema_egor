"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { КОНТАКТЫ } from "@/lib/legal";

/**
 * Подвал сайта со ссылками на правовые документы и поддержку.
 *
 * Появился по требованию банка при подключении приёма платежей: политика,
 * соглашение и контакт поддержки должны быть в постоянном доступе, а не
 * где-то в переписке. Заодно это просто нужно сайту.
 *
 * На ТВ-экранах подвала быть НЕ должно: там экран — колонка ровно в высоту
 * кадра, прокрутки страницы нет, и лишний блок внизу ломает раскладку.
 * Управление там пультом, ссылки всё равно не нажать.
 */
const ТВ_ЭКРАНЫ = ["/tv-home", "/tv-login", "/tv-search", "/tv-watch"];

export function SiteFooter() {
  const путь = usePathname() || "";
  if (ТВ_ЭКРАНЫ.some((п) => путь === п || путь.startsWith(п + "/"))) return null;

  return (
    <footer className="border-t border-white/[0.06] mt-16">
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-foreground/45">
          <Link href="/privacy" className="hover:text-foreground/80 transition-colors">
            Политика конфиденциальности
          </Link>
          <Link href="/terms" className="hover:text-foreground/80 transition-colors">
            Пользовательское соглашение
          </Link>
          <Link href="/support" className="hover:text-foreground/80 transition-colors">
            Поддержка
          </Link>
          <a
            href={КОНТАКТЫ.телеграмСсылка}
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground/80 transition-colors"
          >
            {КОНТАКТЫ.телеграм}
          </a>
        </div>
        <p className="mt-4 text-center text-[12px] text-foreground/30">
          {КОНТАКТЫ.сайт} — каталог и проигрыватель материалов, размещённых в открытом
          доступе на сторонних площадках.
        </p>
      </div>
    </footer>
  );
}
