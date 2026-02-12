import { Navbar } from "@/components/navbar";
import { TVPlayer } from "@/components/tv-player";
import { Comments } from "@/components/comments";
import { getTVDetails } from "@/lib/tmdb";
import { getImageUrl } from "@/lib/tmdb";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

interface TVPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TVPageProps): Promise<Metadata> {
  const { id } = await params;
  const show = await getTVDetails(Number(id));
  if (!show) return { title: "Сериал не найден" };
  return {
    title: `${show.name} — Кинотеатр Егора`,
    description: show.overview?.slice(0, 160),
  };
}

export default async function TVPage({ params }: TVPageProps) {
  const { id } = await params;
  const show = await getTVDetails(Number(id));
  if (!show) notFound();

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen pb-20 sm:pb-0">
        <TVPlayer show={show} />

        <div className="max-w-7xl mx-auto px-4 pb-12">
          {show.seasons && show.seasons.filter(s => s.season_number > 0).length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold text-foreground mb-4">Сезоны</h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {show.seasons.filter(s => s.season_number > 0).map(season => (
                  <div key={season.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="relative aspect-[2/3] bg-muted">
                      <Image
                        src={getImageUrl(season.poster_path || show.poster_path, "w342")}
                        alt={season.name}
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 50vw, 185px"
                      />
                    </div>
                    <div className="p-3">
                      <h3 className="text-sm font-semibold text-foreground">{season.name}</h3>
                      <p className="text-xs text-muted-foreground mt-1">{season.episode_count} серий</p>
                      {season.air_date && (
                        <p className="text-xs text-muted-foreground">{new Date(season.air_date).getFullYear()}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {show.overview && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold text-foreground mb-4">Описание</h2>
              <p className="text-muted-foreground leading-relaxed text-lg">{show.overview}</p>
            </section>
          )}

          <section className="mt-10 grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Дата выхода</h3>
              <p className="text-foreground">
                {show.first_air_date ? new Date(show.first_air_date).toLocaleDateString("ru-RU", { year: "numeric", month: "long", day: "numeric" }) : "Неизвестно"}
              </p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Статус</h3>
              <p className="text-foreground">{show.status}</p>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Рейтинг</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl text-primary">⭐</span>
                <span className="text-foreground text-lg">{show.vote_average.toFixed(1)}/10</span>
                <span className="text-muted-foreground">({show.vote_count?.toLocaleString()} голосов)</span>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Сезоны / Серии</h3>
              <p className="text-foreground">{show.number_of_seasons} сезон(ов), {show.number_of_episodes} серий</p>
            </div>
          </section>

          {show.genres && show.genres.length > 0 && (
            <section className="mt-8">
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Жанры</h3>
              <div className="flex flex-wrap gap-2">
                {show.genres.map(genre => (
                  <span key={genre.id} className="px-4 py-2 bg-card border border-border rounded-full text-foreground text-sm">
                    {genre.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          {/* Comments */}
          <section className="mt-10 pt-8 border-t border-border">
            <Comments mediaId={show.id} mediaType="tv" />
          </section>
        </div>
      </main>
    </>
  );
}
