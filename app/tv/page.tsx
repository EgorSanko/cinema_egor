import { Navbar } from "@/components/navbar";
import { TVSection } from "@/components/tv-section";
import { getTrendingTV, getPopularTV } from "@/lib/tmdb";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Сериалы - Кинотеатр Егора",
  description: "Смотрите популярные сериалы онлайн бесплатно в HD качестве",
};

export default async function TVPage() {
  const [trendingTV, popularTV] = await Promise.all([
    getTrendingTV("week"),
    getPopularTV(),
  ]);

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-12 space-y-12">
          <div>
            <h1 className="text-4xl font-bold text-foreground mb-3">Сериалы</h1>
            <p className="text-muted-foreground text-lg">Смотрите популярные сериалы онлайн бесплатно</p>
          </div>
          {trendingTV.length > 0 && (
            <TVSection title="🔥 В тренде" shows={trendingTV.slice(0, 18)} />
          )}
          {popularTV.length > 0 && (
            <TVSection title="Популярные" shows={popularTV.slice(0, 18)} />
          )}
        </div>
      </main>
    </>
  );
}
