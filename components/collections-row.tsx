import Link from "next/link";
import Image from "next/image";
import { getImageUrl, getGenreInfo } from "@/lib/tmdb";
import { ArrowRight } from "lucide-react";

const FEATURED = [
  { id: 9648, name: "Лучшие детективы" },
  { id: 878, name: "Научная фантастика" },
  { id: 10751, name: "Для всей семьи" },
  { id: 35, name: "Комедии" },
  { id: 53, name: "Триллеры" },
];

function pluralizeFilms(n: number): string {
  const r = n % 10;
  const t = n % 100;
  if (t > 10 && t < 20) return "фильмов";
  if (r === 1) return "фильм";
  if (r >= 2 && r <= 4) return "фильма";
  return "фильмов";
}

export async function CollectionsRow() {
  const items = await Promise.all(
    FEATURED.map(async (g) => ({ ...g, ...(await getGenreInfo(g.id)) }))
  );
  return (
    <section className="space-y-5">
      <h2 className="text-2xl font-bold text-foreground tracking-tight">Подборки для вас</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        {items.map((c) => {
          const backdrop = c.backdrop ? getImageUrl(c.backdrop, "w500") : null;
          return (
            <Link key={c.id} href={`/genres/${c.id}`} className="block group">
              <div className="relative h-36 rounded-2xl overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:ring-white/15 shadow-md shadow-black/20 hover:shadow-xl hover:shadow-black/40">
                {backdrop && (
                  <Image
                    src={backdrop}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 250px"
                    className="object-cover opacity-50 transition-opacity duration-500 group-hover:opacity-80"
                  />
                )}
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-background/85 via-background/40 to-transparent" />
                <div className="relative h-full p-4 flex flex-col justify-end">
                  <div className="flex items-end justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-foreground text-[15px] sm:text-base font-bold leading-tight">{c.name}</h3>
                      {c.total > 0 && (
                        <p className="text-foreground/75 text-[12px] mt-1">
                          {c.total.toLocaleString("ru-RU")} {pluralizeFilms(c.total)}
                        </p>
                      )}
                    </div>
                    <div className="w-8 h-8 rounded-full bg-foreground/[0.06] ring-1 ring-white/[0.12] backdrop-blur flex items-center justify-center text-foreground/80 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary transition-colors flex-shrink-0">
                      <ArrowRight size={14} />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
