/**
 * Achievement slug → Lucide React component. Kept separate from
 * lib/achievements.ts so that file stays plain TS (no JSX) and can be
 * imported in server code without React in scope.
 *
 * All icons are stroke SVGs from lucide-react (same visual family as
 * Tabler Icons — MIT, consistent stroke weight). Replaces previous
 * emoji which rendered inconsistently across OSes.
 */
import {
  Clapperboard, Popcorn, Film, Trophy, Tv, Sofa, Flame, Footprints,
  Target, Moon, Bird, CalendarDays, Crown, CassetteTape, Drama, Sparkles,
  Star, Gem, Library, Globe, Clock, Hourglass, type LucideIcon, Award,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  clapperboard: Clapperboard,
  popcorn: Popcorn,
  film: Film,
  trophy: Trophy,
  tv: Tv,
  sofa: Sofa,
  flame: Flame,
  footprints: Footprints,
  target: Target,
  moon: Moon,
  bird: Bird,
  "calendar-days": CalendarDays,
  crown: Crown,
  tape: CassetteTape,
  drama: Drama,
  sparkles: Sparkles,
  star: Star,
  gem: Gem,
  library: Library,
  globe: Globe,
  clock: Clock,
  hourglass: Hourglass,
};

export function AchievementIcon({ slug, size = 24, className = "" }: { slug: string; size?: number; className?: string }) {
  const Icon = ICON_MAP[slug] || Award;
  return <Icon size={size} className={className} strokeWidth={1.5} />;
}
