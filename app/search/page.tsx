import { Navbar } from "@/components/navbar";
import { MovieCard } from "@/components/movie-card";
import { TVCard } from "@/components/tv-card";
import { searchMovies, searchTV, searchPeople, profileUrl } from "@/lib/tmdb";
import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import type { Metadata } from "next";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

// ── HDRezka availability filter ──
// We search TMDB (rich metadata/posters), then keep only the titles that ALSO
// exist on HDRezka — so search never shows something that can't actually play.
const HDREZKA_FIND = "https://kino.lead-seek.ru/hdrezka/api/find";

interface HdHit { name: string; year: number | null }

function normTitle(s?: string): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9а-яё]/gi, "");
}

async function getHdrezkaHits(query: string): Promise<HdHit[]> {
  try {
    const res = await fetch(`${HDREZKA_FIND}?q=${encodeURIComponent(query)}`, {
      next: { revalidate: 300 },
    });
    const data = await res.json();
    return Array.isArray(data?.results) ? data.results : [];
  } catch {
    return [];
  }
}

// A TMDB item is "available" if some HDRezka hit matches its title (ru OR original,
// either side containing the other) and the year is within ±1.
function isAvailable(
  item: { title?: string; name?: string; original_title?: string; original_name?: string; release_date?: string; first_air_date?: string },
  hits: HdHit[],
): boolean {
  const titles = [item.title, item.name, item.original_title, item.original_name]
    .map(normTitle)
    .filter(Boolean);
  const yr = parseInt((item.release_date || item.first_air_date || "").slice(0, 4), 10) || null;
  return hits.some((h) => {
    const hn = normTitle(h.name);
    if (!hn) return false;
    const titleMatch = titles.some((t) => t === hn || t.includes(hn) || hn.includes(t));
    if (!titleMatch) return false;
    if (yr && h.year) return Math.abs(yr - h.year) <= 1;
    return true; // title matches, one side has no year — accept
  });
}

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}

// TMDB caps search at 20/page; HDRezka has long tails (e.g. "шерлок" → 100+ films
// across many TMDB pages). Pull several pages so the availability intersection
// isn't starved by page-1-only recall.
async function searchMoviesPaged(query: string, pages: number) {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) => searchMovies(query, i + 1)));
  return dedupeById(res.flat());
}
async function searchTVPaged(query: string, pages: number) {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) => searchTV(query, i + 1)));
  return dedupeById(res.flat());
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q || "";
  return {
    title: `Результаты поиска "${query}" - sapkeflykino`,
    description: `Результаты поиска по запросу "${query}"`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const [movieResults, tvResults, peopleResults, hdHits] = query
    ? await Promise.all([
        searchMoviesPaged(query, 5),
        searchTVPaged(query, 3),
        searchPeople(query),
        getHdrezkaHits(query),
      ])
    : [[], [], [], []];

  // Keep only TMDB titles that exist on HDRezka. If the availability backend is
  // unreachable (no hits at all), fall back to showing everything rather than an
  // empty page.
  const filterAvail = hdHits.length > 0;
  const finalMovies = filterAvail ? movieResults.filter((m) => isAvailable(m, hdHits)) : movieResults;
  const finalTV = filterAvail ? tvResults.filter((t) => isAvailable(t, hdHits)) : tvResults;

  // Filter out "people" with no profile photo and no known_for entries (low-signal noise)
  const filteredPeople = peopleResults.filter(
    p => p.profile_path || (p.known_for && p.known_for.length > 0)
  ).slice(0, 12);

  const totalResults = finalMovies.length + finalTV.length + filteredPeople.length;

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-foreground mb-2">
              {query ? `Результаты поиска "${query}"` : "Поиск"}
            </h1>
            <p className="text-muted-foreground">
              {query
                ? `Найдено ${totalResults} результат(ов)`
                : "Введите запрос для поиска фильмов, сериалов и актёров"}
            </p>
          </div>

          {filteredPeople.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">👤 Люди</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-4">
                {filteredPeople.map(p => (
                  <Link key={p.id} href={`/person/${p.id}`} className="group">
                    <div className="aspect-[2/3] rounded-lg overflow-hidden bg-card relative">
                      {p.profile_path ? (
                        <Image
                          src={profileUrl(p.profile_path) || ""}
                          alt={p.name}
                          fill
                          className="object-cover group-hover:scale-110 transition-transform duration-300"
                          sizes="(max-width: 768px) 33vw, 120px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <User size={36} />
                        </div>
                      )}
                    </div>
                    <p className="text-foreground text-sm font-medium mt-2 line-clamp-1 group-hover:text-primary transition-colors">{p.name}</p>
                    {p.known_for_department && (
                      <p className="text-muted-foreground text-xs line-clamp-1">{p.known_for_department}</p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {finalMovies.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">🎬 Фильмы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {finalMovies.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} />
                ))}
              </div>
            </section>
          )}

          {finalTV.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">📺 Сериалы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {finalTV.map((show) => (
                  <TVCard key={show.id} show={show} />
                ))}
              </div>
            </section>
          )}

          {query && totalResults === 0 && (
            <div className="text-center py-16">
              <p className="text-xl text-muted-foreground mb-4">По вашему запросу ничего не найдено.</p>
              <p className="text-sm text-muted-foreground">Попробуйте другое название.</p>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
