import Link from "next/link";
import Image from "next/image";
import type { Genre } from "@/lib/tmdb";
import { getImageUrl } from "@/lib/tmdb";
import {
  ArrowRight, Sparkles, Crosshair, Compass, Drama, ShieldAlert, Camera,
  Users, Wand2, Skull, Heart, Rocket, Tv, AlertTriangle, Shield, Mountain,
  ScrollText, HelpCircle, Music, Star,
} from "lucide-react";

// Genre theme: brand color + lucide icon
type IconType = React.ComponentType<{ size?: number; className?: string }>;
const GENRE_THEME: Record<number, { color: string; Icon: IconType }> = {
  28:    { color: "#f43f5e", Icon: Crosshair },        // Боевик
  12:    { color: "#f97316", Icon: Compass },          // Приключения
  16:    { color: "#eab308", Icon: Sparkles },         // Мультфильм
  35:    { color: "#22c55e", Icon: Drama },            // Комедия
  80:    { color: "#06b6d4", Icon: ShieldAlert },      // Криминал
  99:    { color: "#3b82f6", Icon: Camera },           // Документальный
  18:    { color: "#0ea5e9", Icon: Drama },            // Драма
  10751: { color: "#a855f7", Icon: Users },            // Семейный
  14:    { color: "#d946ef", Icon: Wand2 },            // Фэнтези
  27:    { color: "#ef4444", Icon: Skull },            // Ужасы
  10749: { color: "#ec4899", Icon: Heart },            // Мелодрама
  878:   { color: "#6366f1", Icon: Rocket },           // Научная фантастика
  10770: { color: "#f59e0b", Icon: Tv },               // Телефильм
  53:    { color: "#fb7185", Icon: AlertTriangle },    // Триллер
  10752: { color: "#a16207", Icon: Shield },           // Военный
  37:    { color: "#64748b", Icon: Mountain },         // Вестерн
  36:    { color: "#92400e", Icon: ScrollText },       // История
  9648:  { color: "#7c3aed", Icon: HelpCircle },       // Детектив
  10402: { color: "#10b981", Icon: Music },            // Музыка
};

const DEFAULT_THEME = { color: "#6366f1", Icon: Sparkles };

function pluralizeFilms(n: number): string {
  const r = n % 10;
  const t = n % 100;
  if (t > 10 && t < 20) return "фильмов";
  if (r === 1) return "фильм";
  if (r >= 2 && r <= 4) return "фильма";
  return "фильмов";
}

function formatCount(n: number): string {
  if (!n) return "—";
  return n.toLocaleString("ru-RU");
}

interface GenreCardData extends Genre {
  total?: number;
  backdrop?: string | null;
}

interface GenreGridProps {
  genres: GenreCardData[];
}

export function GenreGrid({ genres }: GenreGridProps) {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {genres.map((genre) => {
          const theme = GENRE_THEME[genre.id] || DEFAULT_THEME;
          const { color, Icon } = theme;
          const backdrop = genre.backdrop ? getImageUrl(genre.backdrop, "w500") : null;
          const total = genre.total ?? 0;
          return (
            <Link key={genre.id} href={`/genres/${genre.id}`} className="block">
              <div
                className="group relative h-44 rounded-2xl overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300 hover:-translate-y-0.5 hover:ring-white/15"
                style={{
                  boxShadow: `0 8px 28px -10px ${color}30`,
                }}
              >
                {/* Backdrop */}
                {backdrop && (
                  <Image
                    src={backdrop}
                    alt=""
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover opacity-30 transition-all duration-500 group-hover:opacity-50 group-hover:scale-105"
                  />
                )}
                {/* Color tint + dark gradient for text legibility */}
                <div
                  className="pointer-events-none absolute inset-0"
                  style={{
                    background: `linear-gradient(135deg, ${color}30 0%, transparent 55%, rgba(0,0,0,0.6) 100%)`,
                  }}
                />
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-background/85 via-background/35 to-background/0" />

                {/* Content */}
                <div className="relative h-full p-5 flex flex-col">
                  {/* Glowing genre icon */}
                  <div
                    className="w-12 h-12 rounded-2xl flex items-center justify-center ring-1 backdrop-blur-sm"
                    style={{
                      background: `${color}1f`,
                      color,
                      borderColor: `${color}40`,
                      boxShadow: `0 0 24px ${color}55`,
                    }}
                  >
                    <Icon size={22} />
                  </div>

                  {/* Bottom row */}
                  <div className="mt-auto flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-xl sm:text-2xl font-bold text-foreground leading-tight">{genre.name}</h3>
                      {total > 0 && (
                        <p className="text-foreground/55 text-sm mt-1">
                          {formatCount(total)} {pluralizeFilms(total)}
                        </p>
                      )}
                    </div>
                    <div className="w-10 h-10 rounded-full bg-foreground/5 ring-1 ring-white/15 backdrop-blur flex items-center justify-center text-foreground/80 group-hover:bg-primary group-hover:text-primary-foreground group-hover:ring-primary transition-colors flex-shrink-0">
                      <ArrowRight size={16} />
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* CTA banner */}
      <div className="mt-8 rounded-2xl bg-gradient-to-r from-primary/[0.06] via-background/40 to-background/40 ring-1 ring-white/[0.06] backdrop-blur p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-primary/15 ring-1 ring-primary/25 flex items-center justify-center text-primary shadow-[0_0_24px_rgba(163,230,53,0.25)] flex-shrink-0">
            <Star size={20} />
          </div>
          <div>
            <h4 className="text-base sm:text-lg font-semibold text-foreground">Не знаете, что выбрать?</h4>
            <p className="text-foreground/55 text-[13px] sm:text-sm mt-0.5">Мы подберём фильмы специально для вас</p>
          </div>
        </div>
        <Link
          href="/swipe"
          className="inline-flex items-center gap-2 px-5 h-11 rounded-full bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors flex-shrink-0"
        >
          Подобрать фильм
          <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
