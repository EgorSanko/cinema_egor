import { Navbar } from "@/components/navbar";
import { MovieCard } from "@/components/movie-card";
import { TVCard } from "@/components/tv-card";
import { searchMovies, searchTV } from "@/lib/tmdb";
import type { Metadata } from "next";

interface SearchPageProps {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const params = await searchParams;
  const query = params.q || "";
  return {
    title: `Результаты поиска "${query}" - Кинотеатр Егора`,
    description: `Результаты поиска по запросу "${query}"`,
  };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const query = params.q || "";
  const [movieResults, tvResults] = query
    ? await Promise.all([searchMovies(query), searchTV(query)])
    : [[], []];

  const totalResults = movieResults.length + tvResults.length;

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
                : "Введите запрос для поиска фильмов и сериалов"}
            </p>
          </div>

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
