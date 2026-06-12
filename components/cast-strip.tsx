import Link from "next/link";
import Image from "next/image";
import { User } from "lucide-react";
import { profileUrl } from "@/lib/tmdb";

interface CastMember {
  id: number;
  name: string;
  character?: string;
  profile_path: string | null;
  order?: number;
}

/**
 * Horizontal cast strip for movie/TV detail pages. Each actor links to the
 * existing /person/[id] filmography page. Top-billed first (TMDB returns cast
 * in billing order); we keep those with a photo up front but still show
 * photoless ones (placeholder) so the list isn't silently truncated.
 */
export function CastStrip({ cast }: { cast?: CastMember[] }) {
  if (!cast || cast.length === 0) return null;

  // Billing order, photographed actors first, cap at 24 for the strip.
  const ordered = [...cast].sort((a, b) => {
    const ap = a.profile_path ? 0 : 1;
    const bp = b.profile_path ? 0 : 1;
    if (ap !== bp) return ap - bp;
    return (a.order ?? 999) - (b.order ?? 999);
  });
  const list = ordered.slice(0, 24);

  return (
    <section className="mt-10">
      <h2 className="text-2xl font-bold text-foreground tracking-tight mb-5">В ролях</h2>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "thin" }}>
        {list.map((c) => {
          const img = profileUrl(c.profile_path, "w185");
          return (
            <Link
              key={`${c.id}-${c.order ?? ""}`}
              href={`/person/${c.id}`}
              className="group flex-shrink-0 w-[100px] text-center"
            >
              <div className="relative w-[100px] h-[100px] rounded-full overflow-hidden ring-1 ring-white/[0.08] bg-foreground/[0.04] mx-auto transition-all duration-300 group-hover:ring-primary/40 group-hover:-translate-y-0.5">
                {img ? (
                  <Image
                    src={img}
                    alt={c.name}
                    fill
                    sizes="100px"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-foreground/30">
                    <User size={36} />
                  </div>
                )}
              </div>
              <p className="mt-2 text-foreground/90 text-[12.5px] font-semibold leading-tight line-clamp-2 group-hover:text-primary transition-colors">
                {c.name}
              </p>
              {c.character && (
                <p className="text-foreground/45 text-[11px] mt-0.5 line-clamp-1">{c.character}</p>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
