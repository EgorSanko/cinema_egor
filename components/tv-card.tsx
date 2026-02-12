"use client";

import type { TVShow } from "@/lib/tmdb";
import { getImageUrl } from "@/lib/tmdb";
import Image from "next/image";
import Link from "next/link";
import { FavoriteButton } from "./favorite-button";

interface TVCardProps {
  show: TVShow;
}

export function TVCard({ show }: TVCardProps) {
  return (
    <Link href={`/tv/${show.id}`}>
      <div className="group cursor-pointer h-full">
        <div className="relative overflow-hidden rounded-lg aspect-[2/3] bg-card">
          <Image
            src={getImageUrl(show.poster_path, "w342") || "/placeholder.svg"}
            alt={show.name}
            fill
            className="object-cover group-hover:scale-110 transition-all duration-300 ease-in-out"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
          {/* Badge */}
          <div className="absolute top-2 left-2 bg-primary/90 text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase z-10">
            Сериал
          </div>
          {/* Favorite button */}
          <div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="bg-black/60 backdrop-blur-sm rounded-full p-1.5">
              <FavoriteButton
                item={{
                  id: show.id,
                  type: "tv",
                  title: show.name,
                  poster_path: show.poster_path,
                  vote_average: show.vote_average,
                  first_air_date: show.first_air_date,
                }}
              />
            </div>
          </div>
          {/* Overlay on hover */}
          <div className="absolute inset-0 bg-gradient-overlay opacity-0 group-hover:opacity-100 transition-all duration-300 ease-in-out flex flex-col justify-end p-4">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-primary/90 flex items-center justify-center transform scale-0 group-hover:scale-100 transition-transform duration-300 delay-100">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-white ml-1">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                </svg>
              </div>
            </div>
            <div className="space-y-2 w-full relative z-10">
              <h3 className="font-semibold text-foreground line-clamp-2">{show.name}</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">⭐ {show.vote_average.toFixed(1)}</span>
                <span className="text-sm text-muted-foreground">
                  {show.first_air_date ? new Date(show.first_air_date).getFullYear() : ""}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
