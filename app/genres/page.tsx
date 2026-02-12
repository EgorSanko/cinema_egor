import { Navbar } from "@/components/navbar"
import { GenreGrid } from "@/components/genre-grid"
import { getGenres } from "@/lib/tmdb"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Жанры - Кинотеатр Егора",
  description: "Выбирайте фильмы по жанрам. Найдите любимые фильмы по категориям.",
}

export default async function GenresPage() {
  const genres = await getGenres()

  return (
    <>
      <Navbar />
      <main className="bg-background min-h-screen">
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="mb-12">
            <h1 className="text-4xl font-bold text-foreground mb-3">Жанры</h1>
            <p className="text-muted-foreground text-lg">
              Выбирайте фильмы по жанрам. Нажмите на жанр, чтобы увидеть все доступные фильмы.
            </p>
          </div>
          {genres.length > 0 ? (
            <GenreGrid genres={genres} />
          ) : (
            <div className="text-center py-16">
              <p className="text-muted-foreground">Не удалось загрузить жанры. Попробуйте позже.</p>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
