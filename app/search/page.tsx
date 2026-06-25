import { Navbar } from "@/components/navbar";
import { MovieCard } from "@/components/movie-card";
import { TVCard } from "@/components/tv-card";
import { HdCard } from "@/components/hd-card";
import { searchMovies, searchTV, searchPeople, profileUrl } from "@/lib/tmdb";
import Image from "next/image";
import Link from "next/link";
import { User } from "lucide-react";
import type { Metadata } from "next";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

// ── HDRezka-driven search ──
// HDRezka is the source of truth (everything shown is actually available). Each
// HDRezka hit is matched to a TMDB entry for a rich card + the existing detail
// page; hits with no TMDB match get an HDRezka-native card → /hd/[token].
const HDREZKA_FIND = "https://kino.lead-seek.ru/hdrezka/api/find";

interface HdHit {
  name: string;
  year: number | null;
  type: "movie" | "tv";
  url: string;
  poster: string | null;
}

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

function dedupeById<T extends { id: number }>(items: T[]): T[] {
  const seen = new Set<number>();
  return items.filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
}

// TMDB caps search at 20/page; pull several pages so matching isn't starved.
async function searchMoviesPaged(query: string, pages: number) {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) => searchMovies(query, i + 1)));
  return dedupeById(res.flat());
}
async function searchTVPaged(query: string, pages: number) {
  const res = await Promise.all(Array.from({ length: pages }, (_, i) => searchTV(query, i + 1)));
  return dedupeById(res.flat());
}

type TmdbCand = { obj: any; mt: "movie" | "tv" };

// Find a TMDB entry whose title (ru/original, either side containing the other)
// and year (±1) match the HDRezka hit.
function matchTmdb(hit: HdHit, pool: TmdbCand[]): TmdbCand | null {
  const hn = normTitle(hit.name);
  if (!hn) return null;
  const hy = hit.year;
  for (const cand of pool) {
    const t = cand.obj;
    const titles = [t.title, t.name, t.original_title, t.original_name].map(normTitle).filter(Boolean);
    const titleMatch = titles.some((x: string) => x === hn || x.includes(hn) || hn.includes(x));
    if (!titleMatch) continue;
    const ty = parseInt((t.release_date || t.first_air_date || "").slice(0, 4), 10) || null;
    if (hy && ty && Math.abs(hy - ty) > 1) continue;
    return cand;
  }
  return null;
}

function tokenFor(url: string): string {
  return Buffer.from(url).toString("base64url");
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q || "";
  return {
    title: `Результаты поиска "${query}" - sapkeflykino`,
    description: `Результаты поиска по запросу "${query}"`,
  };
}

type Item = { kind: "tmdb"; mt: "movie" | "tv"; obj: any } | { kind: "hd"; hit: HdHit; href: string };

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
    : [[], [], [], [] as HdHit[]];

  const movieItems: Item[] = [];
  const tvItems: Item[] = [];

  if (hdHits.length > 0) {
    // HDRezka drives the result set.
    const pool: TmdbCand[] = [
      ...movieResults.map((m: any) => ({ obj: m, mt: "movie" as const })),
      ...tvResults.map((t: any) => ({ obj: t, mt: "tv" as const })),
    ];
    const usedTmdb = new Set<string>();
    const seenUrl = new Set<string>();
    for (const hit of hdHits) {
      if (!hit.url || seenUrl.has(hit.url)) continue;
      seenUrl.add(hit.url);
      const match = matchTmdb(hit, pool);
      const key = match ? match.mt + ":" + match.obj.id : "";
      if (match && !usedTmdb.has(key)) {
        // First HDRezka hit for this TMDB title → rich card.
        usedTmdb.add(key);
        (match.mt === "tv" ? tvItems : movieItems).push({ kind: "tmdb", mt: match.mt, obj: match.obj });
      } else {
        // No TMDB match, OR a DISTINCT HDRezka title that fuzzy-collided with an
        // already-shown TMDB entry (e.g. the separate Soviet Holmes films) — keep
        // it as its own HDRezka-native card so nothing available is dropped.
        const item: Item = { kind: "hd", hit, href: `/hd/${tokenFor(hit.url)}` };
        (hit.type === "tv" ? tvItems : movieItems).push(item);
      }
    }
  } else {
    // Availability backend unreachable — degrade to plain TMDB so search still works.
    movieResults.forEach((m: any) => movieItems.push({ kind: "tmdb", mt: "movie", obj: m }));
    tvResults.forEach((t: any) => tvItems.push({ kind: "tmdb", mt: "tv", obj: t }));
  }

  const filteredPeople = peopleResults
    .filter((p) => p.profile_path || (p.known_for && p.known_for.length > 0))
    .slice(0, 12);

  const totalResults = movieItems.length + tvItems.length + filteredPeople.length;

  const renderItem = (item: Item) =>
    item.kind === "tmdb" ? (
      item.mt === "tv" ? (
        <TVCard key={"tv-" + item.obj.id} show={item.obj} />
      ) : (
        <MovieCard key={"mv-" + item.obj.id} movie={item.obj} />
      )
    ) : (
      <HdCard
        key={"hd-" + item.href}
        name={item.hit.name}
        year={item.hit.year}
        poster={item.hit.poster}
        type={item.hit.type}
        href={item.href}
      />
    );

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
                {filteredPeople.map((p) => (
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

          {movieItems.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">🎬 Фильмы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {movieItems.map(renderItem)}
              </div>
            </section>
          )}

          {tvItems.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">📺 Сериалы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {tvItems.map(renderItem)}
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
