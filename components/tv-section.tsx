import type { TVShow } from "@/lib/tmdb";
import { TVCard } from "./tv-card";

interface TVSectionProps {
  title: string;
  shows: TVShow[];
}

export function TVSection({ title, shows }: TVSectionProps) {
  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-foreground">{title}</h2>
        <div className="h-1 w-16 bg-primary rounded mt-2" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {shows.map((show) => (
          <TVCard key={show.id} show={show} />
        ))}
      </div>
    </section>
  );
}
