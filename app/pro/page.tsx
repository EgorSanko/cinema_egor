import Link from "next/link";
import { Navbar } from "@/components/navbar";

/**
 * /pro. С 17.09.2026 покупки Про нет: все возможности бесплатны для всех
 * (решение Егора). Страница оставлена, потому что на неё ведут старые ссылки
 * из писем, APK и закладок, — без неё человек увидел бы 404.
 *
 * Старая страница с тарифами и оплатой лежит в истории git (до этого коммита).
 */
export const metadata = { title: "Все возможности бесплатны" };

export default function ProPage() {
  return (
    <>
      <Navbar />
      <main className="min-h-screen pt-28 pb-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl sm:text-[34px] font-bold text-foreground">
            Всё уже бесплатно
          </h1>
          <p className="mt-4 text-[15px] sm:text-base text-foreground/75 leading-relaxed">
            Подписки больше нет — всё, что раньше давала «Про», теперь есть у каждого:
            выбор плеера, продолжение с места остановки, история просмотра и никакой
            нашей рекламы перед фильмом. Платить ничего не нужно.
          </p>
          <p className="mt-3 text-[14px] text-foreground/55 leading-relaxed">
            Если раньше вы оплачивали подписку и остались вопросы — напишите в поддержку.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/"
              className="inline-flex items-center h-11 px-5 rounded-xl bg-primary text-primary-foreground text-[14px] font-semibold hover:opacity-90 transition-opacity"
            >
              Смотреть
            </Link>
            <Link
              href="/support"
              className="inline-flex items-center h-11 px-5 rounded-xl bg-white/[0.06] ring-1 ring-white/12 text-foreground/90 text-[14px] font-semibold hover:bg-white/[0.1] transition-colors"
            >
              Поддержка
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
