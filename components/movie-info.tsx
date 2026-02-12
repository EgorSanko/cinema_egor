"use client";

import type { MovieDetails } from "@/lib/tmdb";
import { Comments } from "./comments";

interface MovieInfoProps {
  movie: MovieDetails;
}

export function MovieInfo({ movie }: MovieInfoProps) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-2xl font-bold text-foreground mb-4">Описание</h2>
        <p className="text-muted-foreground leading-relaxed text-lg">{movie.overview}</p>
      </section>

      <section className="grid md:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Дата выхода</h3>
          <p className="text-foreground">
            {new Date(movie.release_date).toLocaleDateString("ru-RU", {
              year: "numeric", month: "long", day: "numeric",
            })}
          </p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Длительность</h3>
          <p className="text-foreground">{movie.runtime} мин</p>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Рейтинг</h3>
          <div className="flex items-center gap-2">
            <span className="text-2xl text-primary">⭐</span>
            <span className="text-foreground text-lg">{movie.vote_average.toFixed(1)}/10</span>
            <span className="text-muted-foreground">({movie.vote_count.toLocaleString()} голосов)</span>
          </div>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Статус</h3>
          <p className="text-foreground capitalize">{movie.status}</p>
        </div>
      </section>

      {movie.genres.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-3">Жанры</h3>
          <div className="flex flex-wrap gap-2">
            {movie.genres.map((genre) => (
              <span key={genre.id}
                className="px-4 py-2 bg-card border border-border rounded-full text-foreground text-sm hover:bg-primary/10 transition-all cursor-pointer">
                {genre.name}
              </span>
            ))}
          </div>
        </section>
      )}

      {(movie.budget > 0 || movie.revenue > 0) && (
        <section className="grid md:grid-cols-2 gap-6 pt-6 border-t border-border">
          {movie.budget > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Бюджет</h3>
              <p className="text-foreground">${(movie.budget / 1000000).toFixed(1)}M</p>
            </div>
          )}
          {movie.revenue > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-primary uppercase tracking-wider mb-2">Сборы</h3>
              <p className="text-foreground">${(movie.revenue / 1000000).toFixed(1)}M</p>
            </div>
          )}
        </section>
      )}

      {/* Comments */}
      <section className="pt-8 border-t border-border">
        <Comments mediaId={movie.id} mediaType="movie" />
      </section>
    </div>
  );
}
