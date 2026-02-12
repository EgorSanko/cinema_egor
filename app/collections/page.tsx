import { Navbar } from "@/components/navbar";
import { MovieCard } from "@/components/movie-card";
import { TVCard } from "@/components/tv-card";
import type { Metadata } from "next";

const API_BASE_URL = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

export const metadata: Metadata = {
  title: "Подборки - Кинотеатр Егора",
  description: "Тематические подборки фильмов и сериалов",
};

async function fetchTMDB(path: string) {
  try {
    const res = await fetch(`${API_BASE_URL}${path}&api_key=${API_KEY}&language=ru-RU`, { next: { revalidate: 3600 } });
    const data = await res.json();
    return data.results || [];
  } catch { return []; }
}

export default async function CollectionsPage() {
  const [topRated, bestComedy, bestAction, bestHorror, bestAnimation, bestSci, topTV, bestDrama] = await Promise.all([
    fetchTMDB("/movie/top_rated?page=1"),
    fetchTMDB("/discover/movie?with_genres=35&sort_by=vote_average.desc&vote_count.gte=1000&page=1"),
    fetchTMDB("/discover/movie?with_genres=28&sort_by=vote_average.desc&vote_count.gte=1000&page=1"),
    fetchTMDB("/discover/movie?with_genres=27&sort_by=vote_average.desc&vote_count.gte=500&page=1"),
    fetchTMDB("/discover/movie?with_genres=16&sort_by=vote_average.desc&vote_count.gte=500&page=1"),
    fetchTMDB("/discover/movie?with_genres=878&sort_by=vote_average.desc&vote_count.gte=500&page=1"),
    fetchTMDB("/tv/top_rated?page=1"),
    fetchTMDB("/discover/movie?with_genres=18&sort_by=vote_average.desc&vote_count.gte=2000&page=1"),
  ]);

  const collections = [
    { title: "🏆 Топ рейтинга", items: topRated, type: "movie" as const },
    { title: "🎭 Лучшие драмы", items: bestDrama, type: "movie" as const },
    { title: "😂 Лучшие комедии", items: bestComedy, type: "movie" as const },
    { title: "💥 Лучший экшн", items: bestAction, type: "movie" as const },
    { title: "🎃 Лучшие ужасы", items: bestHorror, type: "movie" as const },
    { title: "🚀 Лучшая фантастика", items: bestSci, type: "movie" as const },
    { title: "🎨 Лучшая анимация", items: bestAnimation, type: "movie" as const },
    { title: "📺 Топ сериалов", items: topTV, type: "tv" as const },
  ];

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen pb-20">
        <div className="max-w-7xl mx-auto px-4 py-12 space-y-14">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-3">Подборки</h1>
            <p className="text-muted-foreground text-lg">Тематические коллекции лучших фильмов и сериалов</p>
          </div>

          {collections.map(col => (
            col.items.length > 0 && (
              <section key={col.title} className="space-y-6">
                <div>
                  <h2 className="text-2xl font-bold text-foreground">{col.title}</h2>
                  <div className="h-1 w-16 bg-primary rounded mt-2" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {col.items.slice(0, 12).map((item: any) =>
                    col.type === "tv" ? (
                      <TVCard key={item.id} show={item} />
                    ) : (
                      <MovieCard key={item.id} movie={item} />
                    )
                  )}
                </div>
              </section>
            )
          ))}
        </div>
      </main>
    </>
  );
}
