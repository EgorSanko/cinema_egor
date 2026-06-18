"use client";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@/components/ui/carousel";
import type { Movie, TVShow } from "@/lib/tmdb";
import { getBackdropUrl } from "@/lib/tmdb";
import { Play, Plus, MoreHorizontal, Check } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import * as React from "react";
import { toggleFavorite, isFavorite, type FavoriteItem } from "@/lib/storage";

type HeroItem = Movie | (TVShow & { adult?: boolean });

interface HeroSectionProps {
  movies: HeroItem[];
}

function HeroFavButton({ item }: { item: FavoriteItem }) {
  const [fav, setFav] = React.useState(false);
  React.useEffect(() => { setFav(isFavorite(item.id, item.type)); }, [item.id, item.type]);
  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const res = toggleFavorite(item);
    setFav(res);
    window.dispatchEvent(new CustomEvent("favorites-changed"));
  };
  return (
    <button
      onClick={onClick}
      className={"inline-flex items-center gap-2 h-11 px-5 rounded-full text-[13px] font-semibold ring-1 transition-colors " + (
        fav
          ? "bg-primary/15 text-primary ring-primary/30"
          : "bg-foreground/[0.06] text-foreground/85 ring-white/[0.08] hover:bg-foreground/[0.1]"
      )}
    >
      {fav ? <Check size={16} /> : <Plus size={16} />}
      {fav ? "В избранном" : "В избранное"}
    </button>
  );
}

export function HeroSection({ movies }: HeroSectionProps) {
  const [api, setApi] = React.useState<CarouselApi>();
  const [current, setCurrent] = React.useState(0);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    if (!api) return;
    setCount(api.scrollSnapList().length);
    setCurrent(api.selectedScrollSnap());
    const onSelect = () => setCurrent(api.selectedScrollSnap());
    api.on("select", onSelect);
    const interval = setInterval(() => { api.scrollNext(); }, 8000);
    return () => {
      api.off("select", onSelect);
      clearInterval(interval);
    };
  }, [api]);

  if (!movies || movies.length === 0) return null;

  return (
    <Carousel setApi={setApi} className="w-full relative group -mt-16" opts={{ loop: true }}>
      <CarouselContent>
        {movies.map((item) => {
          const isTv = (item as any).first_air_date !== undefined && (item as any).first_air_date !== null;
          const title = isTv ? (item as TVShow).name : (item as Movie).title;
          const date = isTv ? (item as TVShow).first_air_date : (item as Movie).release_date;
          const year = date ? new Date(date).getFullYear() : "";
          const lastYearStr = isTv && (item as any).last_air_date ? new Date((item as any).last_air_date).getFullYear() : null;
          const yearStr = isTv && lastYearStr && lastYearStr !== year ? year + " – " + lastYearStr : String(year);
          const seasons = isTv ? (item as any).number_of_seasons : null;
          const runtime = !isTv ? (item as any).runtime : null;
          const isAdult = (item as any).adult;
          const detailHref = (isTv ? "/tv/" : "/movie/") + item.id;
          const favItem: FavoriteItem = isTv ? {
            id: item.id, type: "tv", title: title || "",
            poster_path: item.poster_path || null,
            vote_average: item.vote_average || 0,
            first_air_date: date || "",
            addedAt: Date.now(),
          } : {
            id: item.id, type: "movie", title: title || "",
            poster_path: item.poster_path || null,
            vote_average: item.vote_average || 0,
            release_date: date || "",
            addedAt: Date.now(),
          };

          return (
            <CarouselItem key={item.id}>
              <div className="relative w-full h-[78vh] min-h-[560px] md:h-[86vh] md:min-h-[700px] overflow-hidden">
                <Image
                  src={getBackdropUrl(item.backdrop_path) || "/movie-backdrop.png"}
                  alt={title || ""}
                  fill
                  className="object-cover"
                  priority
                  sizes="100vw"
                />
                {/* Left fade for legibility + bottom soft fade */}
                <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />

                <div className="absolute inset-0 flex items-center pt-16">
                  <div className="max-w-[1600px] mx-auto w-full px-4 sm:px-6 lg:px-8">
                    <div className="max-w-xl space-y-4 sm:space-y-5">
                      {/* Type chip */}
                      <span className="inline-block px-2.5 py-1 rounded-md text-[11px] font-extrabold tracking-[0.18em] uppercase text-primary bg-primary/10 ring-1 ring-primary/30">
                        {isTv ? "Сериал" : "Фильм"}
                      </span>

                      {/* Title */}
                      <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-foreground uppercase tracking-tight leading-[1.02]">
                        {title}
                      </h1>

                      {/* Meta row */}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
                        {yearStr && <span className="text-foreground/75">{yearStr}</span>}
                        {seasons && (
                          <>
                            <span className="text-foreground/30">·</span>
                            <span className="text-foreground/75">
                              {seasons}{" "}{seasons === 1 ? "сезон" : seasons < 5 ? "сезона" : "сезонов"}
                            </span>
                          </>
                        )}
                        {runtime && runtime > 0 && (
                          <>
                            <span className="text-foreground/30">·</span>
                            <span className="text-foreground/75">{runtime}{" мин"}</span>
                          </>
                        )}
                        {item.vote_average > 0 && (
                          <>
                            <span className="text-foreground/30">·</span>
                            <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                              ★ {item.vote_average.toFixed(1)}
                            </span>
                          </>
                        )}
                        {isAdult && (
                          <span className="px-1.5 py-0.5 rounded-md bg-foreground/[0.06] text-foreground/65 ring-1 ring-white/[0.08] text-[11px] font-medium">
                            18+
                          </span>
                        )}
                      </div>

                      {item.overview && (
                        <p className="text-foreground/70 text-[14px] sm:text-[15px] leading-relaxed line-clamp-2 max-w-md">
                          {item.overview}
                        </p>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 sm:gap-2.5 pt-2">
                        <Link
                          href={detailHref}
                          className="inline-flex items-center gap-2 h-11 px-5 sm:px-6 rounded-full bg-white text-black text-[13px] font-bold hover:bg-white/90 transition-colors shadow-lg shadow-black/30"
                        >
                          <Play size={16} fill="currentColor" /> {"Смотреть"}
                        </Link>
                        <HeroFavButton item={favItem} />
                        <Link
                          href={detailHref}
                          className="inline-flex items-center justify-center h-11 w-11 rounded-full bg-foreground/[0.06] ring-1 ring-white/[0.08] text-foreground/70 hover:bg-foreground/[0.1] transition-colors"
                          title="Подробнее"
                        >
                          <MoreHorizontal size={18} />
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Pagination dashes */}
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 z-10">
                  {Array.from({ length: count }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => api?.scrollTo(i)}
                      className={"h-[3px] rounded-full transition-all " + (
                        i === current
                          ? "w-10 bg-primary"
                          : "w-5 bg-white/25 hover:bg-white/50"
                      )}
                      aria-label={"Слайд " + (i + 1)}
                    />
                  ))}
                </div>
              </div>
            </CarouselItem>
          );
        })}
      </CarouselContent>

      <CarouselPrevious className="left-4 sm:left-6 top-1/2 h-12 w-12 bg-background/40 border-white/20 backdrop-blur-md text-foreground/85 hover:bg-background/70 hover:text-foreground transition-opacity opacity-60 group-hover:opacity-100" />
      <CarouselNext className="right-4 sm:right-6 top-1/2 h-12 w-12 bg-background/40 border-white/20 backdrop-blur-md text-foreground/85 hover:bg-background/70 hover:text-foreground transition-opacity opacity-60 group-hover:opacity-100" />
    </Carousel>
  );
}
