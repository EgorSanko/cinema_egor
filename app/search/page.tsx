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
  const [movieResults, tvResults, peopleResults] = query
    ? await Promise.all([searchMovies(query), searchTV(query), searchPeople(query)])
    : [[], [], []];

  // Filter out "people" with no profile photo and no known_for entries (low-signal noise)
  const filteredPeople = peopleResults.filter(
    p => p.profile_path || (p.known_for && p.known_for.length > 0)
  ).slice(0, 12);

  const totalResults = movieResults.length + tvResults.length + filteredPeople.length;

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

          {movieResults.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">🎬 Фильмы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {movieResults.map((movie) => (
                  <MovieCard key={movie.id} movie={movie} />
                ))}
              </div>
            </section>
          )}

          {tvResults.length > 0 && (
            <section className="mb-12">
              <h2 className="text-2xl font-bold text-foreground mb-4">📺 Сериалы</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {tvResults.map((show) => (
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
