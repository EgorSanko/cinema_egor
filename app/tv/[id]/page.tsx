import { Navbar } from "@/components/navbar";
import { TVPlayer } from "@/components/tv-player";
import { CastStrip } from "@/components/cast-strip";
import { Comments } from "@/components/comments";
import { getTVDetails, getTVRecommendations } from "@/lib/tmdb";
import { getImageUrl } from "@/lib/tmdb";
import { isBlockedTV } from "@/lib/blocked-content";
import { clean, tvSchema } from "@/lib/schema";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";

interface TVPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: TVPageProps): Promise<Metadata> {
  const { id } = await params;
  if (isBlockedTV(Number(id))) {
    return { title: "Контент недоступен", robots: { index: false, follow: false } };
  }
  const show = await getTVDetails(Number(id));
  if (!show) return { title: "Сериал не найден" };

  const ogImage = show.backdrop_path
    ? getImageUrl(show.backdrop_path, "w1280")
    : show.poster_path
      ? getImageUrl(show.poster_path, "w780")
      : undefined;
  const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
  const title = `${show.name}${year ? ` (${year})` : ""} — смотреть онлайн`;
  const desc = show.overview?.slice(0, 200) || "Смотрите сериал бесплатно на sapkeflykino";

  return {
    title,
    description: desc,
    openGraph: {
      siteName: "sapkeflykino",
      title: show.name,
      description: desc,
      type: "video.tv_show",
      url: `/tv/${show.id}`,
      locale: "ru_RU",
      images: ogImage ? [{ url: ogImage, width: 1280, height: 720, alt: show.name }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: show.name,
      description: desc,
      images: ogImage ? [ogImage] : undefined,
    },
    alternates: {
      canonical: `/tv/${show.id}`,
    },
  };
}

export default async function TVPage({ params }: TVPageProps) {
  const { id } = await params;
  if (isBlockedTV(Number(id))) notFound();
  const show = await getTVDetails(Number(id));
  if (!show) notFound();
  const recommendations = await getTVRecommendations(show.id);
  const recs = recommendations.filter(r => r.id !== show.id).slice(0, 6);

  const schema = clean(tvSchema(show));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <Navbar />
      <main className="bg-background min-h-screen pb-20 sm:pb-0">
        <TVPlayer show={show} />

        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 pb-12">
          {/* Genres + status meta row */}
          <section className="mt-10 flex flex-wrap items-center gap-2">
            {show.genres && show.genres.map(genre => (
              <span key={genre.id} className="px-3 py-1.5 rounded-full bg-foreground/[0.04] ring-1 ring-white/[0.08] text-foreground/75 text-[12px] font-medium">
                {genre.name}
              </span>
            ))}
            {show.status && (
              <span className="px-3 py-1.5 rounded-full bg-foreground/[0.04] ring-1 ring-white/[0.08] text-foreground/55 text-[12px]">
                {show.status}
              </span>
            )}
          </section>

          {/* Cast — clickable actors → /person/[id] filmography */}
          <CastStrip cast={(show as any).credits?.cast} />

          {/* Recommendations */}
          {recs.length > 0 && (
            <section className="mt-10">
              <h2 className="text-2xl font-bold text-foreground tracking-tight mb-5">Рекомендуем посмотреть</h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
                {recs.map(r => (
                  <Link key={r.id} href={`/tv/${r.id}`} className="group block">
                    <div className="relative aspect-[2/3] rounded-xl overflow-hidden ring-1 ring-white/[0.06] bg-foreground/[0.04] shadow-md shadow-black/30 transition-all duration-300 group-hover:ring-white/15 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-black/50">
                      {r.poster_path ? (
                        <Image
                          src={getImageUrl(r.poster_path, "w342")}
                          alt={r.name || ""}
                          fill
                          sizes="(max-width: 640px) 33vw, 200px"
                          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                        />
                      ) : null}
                      {r.number_of_seasons && (
                        <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-white text-[10px] font-semibold ring-1 ring-white/15">
                          {r.number_of_seasons} сезон.
                        </span>
                      )}
                    </div>
                    <p className="mt-2 px-0.5 text-foreground/85 text-[13px] font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                      {r.name}
                    </p>
                    {r.first_air_date && (
                      <p className="px-0.5 text-foreground/50 text-[11px] mt-0.5">{new Date(r.first_air_date).getFullYear()}</p>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Comments */}
          <section className="mt-12 pt-8 border-t border-white/[0.06]">
            <Comments mediaId={show.id} mediaType="tv" />
          </section>
        </div>
      </main>
    </>
  );
}
