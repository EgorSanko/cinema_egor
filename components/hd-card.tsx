import Link from "next/link";
import { Film, Tv } from "lucide-react";

// Card for an HDRezka title that has no TMDB match — links to the HDRezka-native
// /hd/[token] page. Uses the HDRezka poster directly.
export function HdCard({
  name,
  year,
  poster,
  type,
  href,
}: {
  name: string;
  year?: number | null;
  poster?: string | null;
  type: "movie" | "tv";
  href: string;
}) {
  const Icon = type === "tv" ? Tv : Film;
  return (
    <Link href={href} className="group block">
      <div className="aspect-[2/3] rounded-lg overflow-hidden bg-card relative ring-1 ring-white/5">
        {poster ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={poster}
            alt={name}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon size={28} className="text-muted-foreground" />
          </div>
        )}
        <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/55 backdrop-blur text-[10px] font-semibold text-white/85">
          <Icon size={10} /> HD
        </span>
      </div>
      <p className="text-foreground text-sm font-medium mt-2 line-clamp-1 group-hover:text-primary transition-colors">
        {name}
      </p>
      {year ? <p className="text-muted-foreground text-xs">{year}</p> : null}
    </Link>
  );
}
