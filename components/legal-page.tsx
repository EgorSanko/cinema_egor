import { Navbar } from "@/components/navbar";
import Link from "next/link";
import { РЕДАКЦИЯ } from "@/lib/legal";

/**
 * Общий каркас правовых страниц.
 *
 * Две страницы (политика и соглашение) должны выглядеть одинаково и одинаково
 * датироваться — иначе при проверке возникают вопросы, почему документы
 * оформлены по-разному.
 */
export function LegalPage({
  заголовок,
  подзаголовок,
  children,
}: {
  заголовок: string;
  подзаголовок: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-background">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-12 pb-24">
          <h1 className="text-3xl sm:text-4xl font-black text-foreground">{заголовок}</h1>
          <p className="mt-3 text-foreground/60 text-[15px] leading-relaxed">{подзаголовок}</p>
          <p className="mt-2 text-foreground/40 text-[13px]">Редакция от {РЕДАКЦИЯ}</p>

          <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-foreground/80">{children}</div>

          <div className="mt-14 pt-6 border-t border-white/[0.08] text-[13px] text-foreground/50">
            <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground">
              Политика конфиденциальности
            </Link>
            {" · "}
            <Link href="/terms" className="underline underline-offset-2 hover:text-foreground">
              Пользовательское соглашение
            </Link>
            {" · "}
            <Link href="/support" className="underline underline-offset-2 hover:text-foreground">
              Поддержка
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}

export function Раздел({ имя, children }: { имя: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-foreground font-bold text-lg mb-3">{имя}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}
