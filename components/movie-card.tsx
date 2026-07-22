"use client";

import type { Movie } from "@/lib/tmdb";
import { getImageUrl } from "@/lib/tmdb";
import Link from "next/link";
import { FavoriteButton } from "./favorite-button";
import { PosterImage } from "./poster-image";

interface MovieCardProps {
  movie: Movie;
}

export function MovieCard({ movie }: MovieCardProps) {
  const rating = movie.vote_average?.toFixed(1) ?? "";
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
  return (
    <Link href={`/movie/${movie.id}`}>
      <div className="group cursor-pointer h-full">
        <div className="relative overflow-hidden rounded-lg aspect-[2/3] bg-card">
          <PosterImage
            src={getImageUrl(movie.poster_path, "w342") || "/placeholder.svg"}
            alt={movie.title}
            className="object-cover group-hover:scale-110 transition-all duration-300 ease-in-out"
            sizes="(max-width: 640px) 45vw, (max-width: 1024px) 25vw, 185px"
          />
          {/* Rating chip — always visible top-left so phone users see it without hovering */}
          {rating && (
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur-sm text-[11px] font-bold text-foreground ring-1 ring-white/10">
              <span className="text-amber-300">★</span>{rating}
            </div>
          )}
          {/* Favorite button */}
          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-1.5">
              <FavoriteButton
                item={{
                  id: movie.id,
                  type: "movie",
                  title: movie.title,
                  poster_path: movie.poster_path,
                  vote_average: movie.vote_average,
                  release_date: movie.release_date,
                }}
              />
            </div>
          </div>
          {/* Always-visible bottom title strip — replaces hover-only label so
              touchscreens (no hover) still show what the poster is. Gradient
              keeps long titles readable over any poster art. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 p-2.5 pt-8 bg-gradient-to-t from-black/95 via-black/70 to-transparent">
            <h3 className="text-foreground font-semibold text-[13px] leading-tight line-clamp-2 drop-shadow">{movie.title}</h3>
            {year && <p className="text-foreground/55 text-[11px] mt-0.5">{year}</p>}
          </div>
          {/* Play-icon hover affordance — desktop sugar, no value on touch */}
          <div className="hidden md:flex absolute inset-0 items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
            <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center transform scale-0 group-hover:scale-100 transition-transform duration-300 delay-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white ml-1">
                <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
