/**
 * Achievement slug → MaterialCommunityIcons name. Mobile mirrors the web's
 * achievement-icons.tsx but uses @expo/vector-icons (lucide-react isn't a
 * RN package). MaterialCommunityIcons is the richest set in vector-icons
 * — it has crown, sofa, drama-masks, bird, cassette and other niche
 * pieces lucide ships.
 */
import React from "react";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";

const ICON_MAP: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  clapperboard: "movie-open-outline",
  popcorn: "popcorn",
  film: "filmstrip",
  trophy: "trophy-outline",
  tv: "television",
  sofa: "sofa-outline",
  flame: "fire",
  footprints: "run",
  target: "bullseye-arrow",
  moon: "moon-waning-crescent",
  bird: "bird",
  "calendar-days": "calendar-week",
  crown: "crown-outline",
  tape: "cassette",
  drama: "drama-masks",
  sparkles: "star-shooting-outline",
  star: "star",
  gem: "diamond-stone",
  library: "bookshelf",
  globe: "earth",
  clock: "clock-outline",
  hourglass: "timer-sand",
};

export function AchievementIcon({ slug, size = 22, color = "#fff" }: { slug: string; size?: number; color?: string }) {
  const name = ICON_MAP[slug] || "trophy-outline";
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
