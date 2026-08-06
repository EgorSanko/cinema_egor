import Link from "next/link";
import Image from "next/image";
import { Navbar } from "@/components/navbar";
import { MovieCard } from "@/components/movie-card";
import { getPopularMovies } from "@/lib/tmdb";
import { Home, Sparkles, Lock } from "lucide-react";

export const metadata = {
  title: "Заблокировано РКН — sapkeflykino",
  robots: { index: false, follow: false },
};

export default async function NotFound() {
  // Server component — pull a fresh row of suggestions so the dead-end page
  // still funnels the user back into content ("А может лучше это?").
  let suggestions: Awaited<ReturnType<typeof getPopularMovies>> = [];
  try {
    suggestions = (await getPopularMovies(1)).slice(0, 6);
  } catch {
    suggestions = [];
  }

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen">
        {/* ===== HERO: фон с заблокированным ТВ ===== */}
        <section className="relative overflow-hidden">
          {/* Background image — TV + РКН-лента. Затемнение слева под текст. */}
          <div className="absolute inset-0">
            <Image
              src="/rkn-404-bg.png"
              alt=""
              fill
              priority
              className="object-cover object-right"
              sizes="100vw"
            />
            {/* Левый градиент: фон → прозрачный, чтобы текст читался */}
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/85 to-background/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-background via-transparent to-transparent" />
          </div>

          <div className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pt-28 sm:pt-32 pb-16 sm:pb-24">
            <div className="max-w-2xl">
              <p className="text-foreground/45 text-sm font-semibold tracking-[0.2em] uppercase">
                Ой-ой…
              </p>
              <h1 className="mt-2 text-7xl sm:text-8xl lg:text-9xl font-black text-primary leading-[0.9] drop-shadow-[0_4px_30px_rgba(163,230,53,0.35)]">
                404
              </h1>
              <h2 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-black text-foreground leading-tight">
                СТРАНИЦА ЗАБЛОКИРОВАНА
                <br />
                <span className="text-primary">ПО ТРЕБОВАНИЮ РКН</span>
              </h2>
              <p className="mt-4 text-foreground/65 text-[15px] sm:text-base max-w-md leading-relaxed">
                Похоже, этот контент слишком хорош для них. Но не для нас.
                Попробуй найти что-то другое — у нас ещё полно годноты!
              </p>

              {/* CTA */}
              <div className="mt-7 flex flex-col sm:flex-row gap-3">
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-primary text-primary-foreground font-bold text-[15px] hover:bg-primary/90 transition-colors shadow-lg shadow-primary/25"
                >
                  <Home size={18} /> На главную
                </Link>
                <Link
                  href="/collections"
                  className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-xl bg-white/[0.06] ring-1 ring-white/[0.12] text-foreground font-semibold text-[15px] hover:bg-white/[0.1] transition-colors"
                >
                  <Sparkles size={18} /> Подборки
                </Link>
              </div>

              {/* Причина блокировки */}
              <div className="mt-6 max-w-md flex items-start gap-3 p-4 rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08] backdrop-blur-sm">
                <Lock size={18} className="text-foreground/45 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[12px] uppercase tracking-wider text-foreground/45 font-bold">
                    Причина блокировки:
                  </p>
                  <p className="text-foreground text-sm font-semibold mt-0.5">
                    «Пропаганда хорошего вкуса и свободы выбора»
                  </p>
                  <p className="text-foreground/40 text-[12px] mt-0.5">
                    Статья 69. Кино, которое они не могут контролировать
                  </p>
                </div>
              </div>

              {/* Утка РКН — пузырь с текстом уже вшит в саму картинку */}
              <div className="mt-6 -ml-4">
                <div className="relative w-[340px] h-[230px] sm:w-[440px] sm:h-[300px]">
                  <Image
                    src="/rkn-duck.png"
                    alt="РКН: ничего личного, просто работа"
                    fill
                    className="object-contain object-left-bottom"
                    sizes="440px"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===== Ряд рекомендаций ===== */}
        {suggestions.length > 0 && (
          <section className="relative max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-12 pb-20 -mt-4">
            <div className="p-5 sm:p-6 rounded-3xl bg-white/[0.03] ring-1 ring-white/[0.06]">
              <h3 className="text-lg sm:text-xl font-bold text-foreground mb-4">
                А может лучше это?
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                {suggestions.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} />
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </>
  );
}
