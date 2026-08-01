import { MoviePlayer } from "@/components/movie-player";
import { Navbar } from "@/components/navbar";
import { CastStrip } from "@/components/cast-strip";
import { DetailsMeta } from "@/components/details-meta";
import { Comments } from "@/components/comments";
import { KpReviews } from "@/components/kp-reviews";
import { getImageUrl, getMovieDetails, getMoviesByGenre, getMovieRecommendations, getTVDetails } from "@/lib/tmdb";
import { isBlockedMovie } from "@/lib/blocked-content";
import { clean, movieSchema } from "@/lib/schema";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

interface MoviePageProps {
params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: MoviePageProps): Promise<Metadata> {
  const movieId = (await params).id;
  if (isBlockedMovie(Number(movieId))) {
    return { title: "Контент недоступен", robots: { index: false, follow: false } };
  }
  const movie = await getMovieDetails(Number(movieId));
  if (!movie) return { title: "Фильм не найден" };

  // Prefer backdrop (16:9 — looks right in TG/WhatsApp/Twitter previews)
  // and fall back to poster (2:3 — works but cropped).
  const ogImage = movie.backdrop_path
    ? getImageUrl(movie.backdrop_path, "w1280")
    : movie.poster_path
      ? getImageUrl(movie.poster_path, "w780")
      : undefined;
  const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
  const title = `${movie.title}${year ? ` (${year})` : ""} — смотреть онлайн`;
  const desc = movie.overview?.slice(0, 200) || "Смотрите фильм бесплатно на sapkeflykino";

  return {
    title,
    description: desc,
    openGraph: {
      siteName: "sapkeflykino",
      title: movie.title,
      description: desc,
      type: "video.movie",
      url: `/movie/${movie.id}`,
      locale: "ru_RU",
      images: ogImage ? [{ url: ogImage, width: 1280, height: 720, alt: movie.title }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: movie.title,
      description: desc,
      images: ogImage ? [ogImage] : undefined,
    },
    alternates: {
      canonical: `/movie/${movie.id}`,
    },
  };
}

export default async function MoviePage({ params }: MoviePageProps) {
  const movieId = Number((await params).id);
  // Block before any data is fetched/rendered. We return 404 instead of a
  // bespoke 451 page so the URL looks "doesn't exist" to crawlers and any
  // automated RKN re-check sees a clean 404.
  if (isBlockedMovie(movieId)) notFound();
  const movie = await getMovieDetails(movieId);
  if (!movie) {
    // Перепутанный тип: id принадлежит СЕРИАЛУ, а не фильму → мягкий редирект
    // на /tv/<id> вместо not-found (зеркально к /tv/[id]).
    const asTv = await getTVDetails(movieId);
    if (asTv) redirect(`/tv/${movieId}`);
    notFound();
  }

  // Real TMDB recommendations (+ /similar top-up). Fall back to genre-popular
  // only if TMDB returns nothing — so the row is relevant, not random-by-genre.
  let relatedMovies = (await getMovieRecommendations(movieId)).filter(m => m.id !== movieId).slice(0, 6);
  if (relatedMovies.length === 0 && movie.genres.length > 0) {
    relatedMovies = (await getMoviesByGenre(movie.genres[0].id)).filter(m => m.id !== movieId).slice(0, 6);
  }

  const schema = clean(movieSchema(movie));

  return (
    <>
      <script
        type="application/ld+json"
        // Schema.org Movie entity for Google rich results + AI engine
        // citations (ChatGPT/Perplexity). JSON-LD spec allows multi-line.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Navbar />
      <main className="bg-background min-h-screen pb-20 sm:pb-0 overflow-x-clip">
        <MoviePlayer movie={movie} variant="deeplex" />

        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          {/* Cast — clickable actors → /person/[id] filmography */}
          <CastStrip cast={(movie as any).credits?.cast} />

          {/* О фильме — director/country/age/tagline + full synopsis + franchise */}
          <DetailsMeta type="movie" data={movie} />

          {/* Отзывы с Кинопоиска */}
          <KpReviews tmdbId={movie.id} type="movie" />

          {/* Recommendations */}
          {relatedMovies.length > 0 && (
            <section className="mt-10">
              <h2 className="text-[22px] sm:text-2xl font-extrabold text-foreground tracking-[-0.01em] mb-5">Похожие фильмы</h2>
              <div className="flex gap-3 sm:gap-4 overflow-x-auto pb-2 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>a]:flex-none [&>a]:w-[132px] sm:[&>a]:w-[160px] [&>a]:snap-start">
                {relatedMovies.map(r => (
                  <Link key={r.id} href={`/movie/${r.id}`} className="group block">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/[0.06] bg-foreground/[0.04] shadow-md shadow-black/30 transition-all duration-300 group-hover:ring-white/15 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-black/50">
                      {r.poster_path ? (
                        <Image
                          src={getImageUrl(r.poster_path, "w342")}
                          alt={r.title || ""}
                          fill
                          sizes="(max-width: 640px) 33vw, 200px"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : null}
                      {r.vote_average > 0 && (
                        <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-black/65 backdrop-blur text-amber-300 text-[10px] font-bold ring-1 ring-white/15">
                          ★ {r.vote_average.toFixed(1)}
                        </span>
                      )}
                    </div>
                    <p className="mt-2 px-0.5 text-foreground/85 text-[13px] font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                      {r.title}
                    </p>
                    {r.release_date && (
                      <p className="px-0.5 text-foreground/50 text-[11px] mt-0.5">{new Date(r.release_date).getFullYear()}</p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Comments */}
          <section className="mt-12 pt-8 border-t border-white/[0.06]">
            <Comments mediaId={movie.id} mediaType="movie" />
          </section>
        </div>
      </main>
    </>
  );
}
