import { Navbar } from "@/components/navbar"
import { GenreGrid } from "@/components/genre-grid"
import { getGenres, getGenreInfo } from "@/lib/tmdb"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Жанры - sapkeflykino",
  description: "Выбирайте фильмы по жанрам. Найдите любимые фильмы по категориям.",
}

export default async function GenresPage() {
  const genres = await getGenres()
  const enriched = await Promise.all(
    genres.map(async (g) => ({ ...g, ...(await getGenreInfo(g.id)) }))
  )

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="mb-10">
            <h1 className="text-4xl sm:text-5xl font-bold text-foreground tracking-tight">Жанры</h1>
            <p className="text-foreground/55 text-base sm:text-lg mt-3">
              Выбирайте фильмы по жанрам. Нажмите на жанр, чтобы увидеть все доступные фильмы.
            </p>
          </div>
          {enriched.length > 0 ? (
            <GenreGrid genres={enriched} />
          ) : (
            <div className="text-center py-16">
              <p className="text-foreground/55">Не удалось загрузить жанры. Попробуйте позже.</p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
