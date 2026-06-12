import Link from "next/link";
import Image from "next/image";
import { getCollection, getImageUrl } from "@/lib/tmdb";

/**
 * "О фильме" / details block — director, country, tagline, age rating, full
 * synopsis, and (for movies in a franchise) the "Часть серии" row linking to
 * the other parts. All data comes from TMDB fields we already fetch
 * (credits/release_dates/content_ratings/belongs_to_collection).
 */

function ageFromMovie(data: any): string | null {
  const results = data?.release_dates?.results || [];
  for (const cc of ["RU", "US"]) {
    const hit = results.find((r: any) => r.iso_3166_1 === cc);
    const cert = hit?.release_dates?.map((d: any) => d.certification).find((c: string) => c);
    if (cert) return cert;
  }
  return null;
}

function ageFromTV(data: any): string | null {
  const results = data?.content_ratings?.results || [];
  for (const cc of ["RU", "US"]) {
    const hit = results.find((r: any) => r.iso_3166_1 === cc);
    if (hit?.rating) return hit.rating;
  }
  return null;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="flex gap-3 py-1.5 text-[13.5px]">
      <span className="text-foreground/45 w-28 flex-shrink-0">{label}</span>
      <span className="text-foreground/85">{children}</span>
    </div>
  );
}

export async function DetailsMeta({ type, data }: { type: "movie" | "tv"; data: any }) {
  const crew = data?.credits?.crew || [];
  const director =
    type === "movie"
      ? crew.filter((c: any) => c.job === "Director").map((c: any) => c.name).slice(0, 3).join(", ")
      : (data?.created_by || []).map((c: any) => c.name).slice(0, 3).join(", ");
  const countries = (data?.production_countries || []).map((c: any) => c.name).join(", ");
  const tagline = data?.tagline;
  const age = type === "movie" ? ageFromMovie(data) : ageFromTV(data);
  const overview = data?.overview;

  // Franchise (movies only)
  let collection: { name: string; parts: any[] } | null = null;
  if (type === "movie" && data?.belongs_to_collection?.id) {
    const c = await getCollection(data.belongs_to_collection.id);
    if (c && c.parts.length > 1) collection = c;
  }

  const hasMeta = director || countries || tagline || age;
  if (!hasMeta && !overview && !collection) return null;

  return (
    <section className="mt-10 grid gap-8 lg:grid-cols-[1fr_minmax(0,360px)]">
      {/* Synopsis */}
      {overview && (
        <div>
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">
            {type === "movie" ? "О фильме" : "О сериале"}
          </h2>
          <p className="text-foreground/70 text-[14px] leading-relaxed whitespace-pre-line">{overview}</p>
        </div>
      )}

      {/* Meta table */}
      {hasMeta && (
        <div className="rounded-2xl bg-foreground/[0.03] ring-1 ring-white/[0.06] p-5 self-start">
          <Row label={type === "movie" ? "Режиссёр" : "Создатели"}>{director}</Row>
          <Row label="Страна">{countries}</Row>
          <Row label="Возраст">{age ? `${age}${/^\d+$/.test(age) ? "+" : ""}` : null}</Row>
          <Row label="Слоган">{tagline ? <span className="italic">«{tagline}»</span> : null}</Row>
        </div>
      )}

      {/* Franchise */}
      {collection && (
        <div className="lg:col-span-2">
          <h2 className="text-2xl font-bold text-foreground tracking-tight mb-5">
            Часть серии «{collection.name.replace(/\s*\(Collection\)$/i, "").replace(/\s*\(Коллекци[яи]\)$/i, "").replace(/\s*—\s*Коллекция$/i, "")}»
          </h2>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 sm:gap-4">
            {collection.parts.map((p) => (
              <Link key={p.id} href={`/movie/${p.id}`} className="group block">
                <div
                  className={
                    "relative aspect-[2/3] rounded-xl overflow-hidden ring-1 bg-foreground/[0.04] shadow-md shadow-black/30 transition-all duration-300 group-hover:-translate-y-0.5 " +
                    (p.id === data.id ? "ring-primary/70" : "ring-white/[0.06] group-hover:ring-white/15")
                  }
                >
                  {p.poster_path ? (
                    <Image
                      src={getImageUrl(p.poster_path, "w342")}
                      alt={p.title || ""}
                      fill
                      sizes="(max-width: 640px) 33vw, 200px"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    />
                  ) : null}
                  {p.id === data.id && (
                    <span className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground text-[10px] font-bold">
                      Сейчас
                    </span>
                  )}
                </div>
                <p className="mt-2 px-0.5 text-foreground/85 text-[13px] font-semibold line-clamp-1 group-hover:text-primary transition-colors">
                  {p.title}
                </p>
                {p.release_date && (
                  <p className="px-0.5 text-foreground/50 text-[11px] mt-0.5">{new Date(p.release_date).getFullYear()}</p>
                )}
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
