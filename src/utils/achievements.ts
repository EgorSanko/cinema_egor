// User stats aggregator + Achievement definitions
// Mirrors movie/lib/achievements.ts so behavior is consistent across web and app.

import type { HistoryItem, FavoriteItem } from "./storage";

export interface UserStats {
  totalMoviesWatched: number;
  totalTvEpisodes: number;
  totalHoursWatched: number;
  completedMovies: number;
  completedTvSeries: number;
  byGenre: Record<string, number>;
  uniqueGenres: number;
  lateNightWatches: number;
  earlyMorningWatches: number;
  consecutiveDays: number;
  totalActiveDays: number;
  oldFilmsWatched: number;
  retroFilmsWatched: number;
  thisYearWatched: number;
  highRatedWatched: number;
  favoritesCount: number;
  uniqueTranslators: number;
  maxEpisodesInOneDay: number;
}

export function emptyStats(): UserStats {
  return {
    totalMoviesWatched: 0,
    totalTvEpisodes: 0,
    totalHoursWatched: 0,
    completedMovies: 0,
    completedTvSeries: 0,
    byGenre: {},
    uniqueGenres: 0,
    lateNightWatches: 0,
    earlyMorningWatches: 0,
    consecutiveDays: 0,
    totalActiveDays: 0,
    oldFilmsWatched: 0,
    retroFilmsWatched: 0,
    thisYearWatched: 0,
    highRatedWatched: 0,
    favoritesCount: 0,
    uniqueTranslators: 0,
    maxEpisodesInOneDay: 0,
  };
}

export function computeStats(history: HistoryItem[], favorites: FavoriteItem[]): UserStats {
  const stats = emptyStats();
  const seenMovies = new Set<number>();
  const seenSeriesEpisodes = new Set<string>();
  const completedSeriesEpisodes = new Map<number, number>();
  const activeDays = new Set<string>();
  const episodesPerDay = new Map<string, number>();
  const translatorSet = new Set<string>();
  const currentYear = new Date().getFullYear();

  for (const h of history) {
    if (!h || h.duration <= 0) continue;
    const ratio = h.progress / h.duration;
    const watchedSec = h.progress;
    if (watchedSec < 60) continue;
    stats.totalHoursWatched += watchedSec / 3600;

    const day = new Date(h.watchedAt).toISOString().slice(0, 10);
    activeDays.add(day);
    episodesPerDay.set(day, (episodesPerDay.get(day) || 0) + 1);

    const hour = new Date(h.watchedAt).getHours();
    if (hour >= 2 && hour < 6) stats.lateNightWatches++;
    if (hour >= 6 && hour < 8) stats.earlyMorningWatches++;

    if (h.type === "movie") {
      if (!seenMovies.has(h.id)) {
        seenMovies.add(h.id);
        stats.totalMoviesWatched++;
      }
      if (ratio >= 0.95) stats.completedMovies++;
    } else if (h.type === "tv") {
      const epKey = `${h.id}-${h.season}-${h.episode}`;
      if (!seenSeriesEpisodes.has(epKey)) {
        seenSeriesEpisodes.add(epKey);
        stats.totalTvEpisodes++;
      }
      if (ratio >= 0.95) {
        completedSeriesEpisodes.set(h.id, (completedSeriesEpisodes.get(h.id) || 0) + 1);
      }
    }

    const dateStr = (h as any).first_air_date || (h as any).release_date;
    if (dateStr) {
      const year = new Date(dateStr).getFullYear();
      if (year && year < 1990) stats.oldFilmsWatched++;
      if (year && year < 1970) stats.retroFilmsWatched++;
      if (year === currentYear) stats.thisYearWatched++;
    }

    if (h.vote_average && h.vote_average >= 9) stats.highRatedWatched++;
    if ((h as any).translatorName) translatorSet.add((h as any).translatorName);
  }

  for (const count of completedSeriesEpisodes.values()) {
    if (count >= 5) stats.completedTvSeries++;
  }

  // Streak
  let streak = 0;
  if (activeDays.size > 0) {
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    const todayStr = cursor.toISOString().slice(0, 10);
    if (!activeDays.has(todayStr)) cursor.setDate(cursor.getDate() - 1);
    while (true) {
      const ds = cursor.toISOString().slice(0, 10);
      if (activeDays.has(ds)) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      } else break;
    }
  }
  stats.consecutiveDays = streak;
  stats.totalActiveDays = activeDays.size;

  for (const c of episodesPerDay.values()) {
    if (c > stats.maxEpisodesInOneDay) stats.maxEpisodesInOneDay = c;
  }

  stats.favoritesCount = favorites.length;
  stats.uniqueTranslators = translatorSet.size;

  return stats;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: string;
  category: "watch" | "tv" | "time" | "era" | "explore" | "social";
  rule: (s: UserStats) => { unlocked: boolean; progress: number; current: number; target: number };
}

const milestone = (current: number, target: number) => ({
  unlocked: current >= target,
  progress: Math.min(current / target, 1),
  current,
  target,
});

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first_movie", name: "Первый сеанс", desc: "Посмотри 1 фильм", icon: "🎬", category: "watch",
    rule: s => milestone(s.totalMoviesWatched, 1) },
  { id: "movies_10", name: "Киноман", desc: "Посмотри 10 фильмов", icon: "🍿", category: "watch",
    rule: s => milestone(s.totalMoviesWatched, 10) },
  { id: "movies_50", name: "Кинокритик", desc: "Посмотри 50 фильмов", icon: "🎞️", category: "watch",
    rule: s => milestone(s.totalMoviesWatched, 50) },
  { id: "movies_100", name: "Кинолегенда", desc: "Посмотри 100 фильмов", icon: "🏆", category: "watch",
    rule: s => milestone(s.totalMoviesWatched, 100) },

  { id: "first_episode", name: "Первая серия", desc: "Посмотри 1 серию", icon: "📺", category: "tv",
    rule: s => milestone(s.totalTvEpisodes, 1) },
  { id: "episodes_50", name: "Сериаломан", desc: "Посмотри 50 серий", icon: "📡", category: "tv",
    rule: s => milestone(s.totalTvEpisodes, 50) },
  { id: "binge_5", name: "Бинж-мастер", desc: "5 серий за день", icon: "🔥", category: "tv",
    rule: s => milestone(s.maxEpisodesInOneDay, 5) },
  { id: "binge_10", name: "Марафонец", desc: "10 серий за день", icon: "💥", category: "tv",
    rule: s => milestone(s.maxEpisodesInOneDay, 10) },
  { id: "series_finished_1", name: "Сериал до конца", desc: "Досмотри сериал целиком", icon: "✅", category: "tv",
    rule: s => milestone(s.completedTvSeries, 1) },

  { id: "night_owl", name: "Полуночник", desc: "Смотри после 02:00", icon: "🌙", category: "time",
    rule: s => milestone(s.lateNightWatches, 1) },
  { id: "early_bird", name: "Жаворонок", desc: "Смотри утром (6-8)", icon: "🌅", category: "time",
    rule: s => milestone(s.earlyMorningWatches, 1) },
  { id: "streak_7", name: "Завсегдатай", desc: "7 дней подряд", icon: "📅", category: "time",
    rule: s => milestone(s.consecutiveDays, 7) },
  { id: "streak_30", name: "Преданный", desc: "30 дней подряд", icon: "⭐", category: "time",
    rule: s => milestone(s.consecutiveDays, 30) },

  { id: "nostalgia", name: "Ностальгия", desc: "Фильм старше 1990 года", icon: "📼", category: "era",
    rule: s => milestone(s.oldFilmsWatched, 1) },
  { id: "retro", name: "Ретро-знаток", desc: "Фильм старше 1970 года", icon: "🎩", category: "era",
    rule: s => milestone(s.retroFilmsWatched, 1) },
  { id: "premiere", name: "Премьера", desc: "Фильм этого года", icon: "🎉", category: "era",
    rule: s => milestone(s.thisYearWatched, 1) },

  { id: "high_rated", name: "Высокий рейтинг", desc: "Фильм с оценкой 9.0+", icon: "⭐", category: "explore",
    rule: s => milestone(s.highRatedWatched, 1) },
  { id: "collector", name: "Коллекционер", desc: "25 в избранном", icon: "❤️", category: "explore",
    rule: s => milestone(s.favoritesCount, 25) },
  { id: "archivist", name: "Архивариус", desc: "100 записей в истории", icon: "📚", category: "explore",
    rule: s => milestone(s.totalMoviesWatched + s.totalTvEpisodes, 100) },
  { id: "polyglot", name: "Полиглот", desc: "5 разных озвучек", icon: "🎙️", category: "explore",
    rule: s => milestone(s.uniqueTranslators, 5) },

  { id: "hours_24", name: "Сутки в кино", desc: "24 часа просмотра", icon: "⏰", category: "watch",
    rule: s => milestone(Math.floor(s.totalHoursWatched), 24) },
  { id: "hours_100", name: "Киноман-100", desc: "100 часов просмотра", icon: "💯", category: "watch",
    rule: s => milestone(Math.floor(s.totalHoursWatched), 100) },
];

export interface UnlockedAchievement extends AchievementDef {
  unlocked: boolean;
  progress: number;
  current: number;
  target: number;
}

export function evaluateAchievements(stats: UserStats): UnlockedAchievement[] {
  return ACHIEVEMENTS.map(a => {
    const r = a.rule(stats);
    return { ...a, ...r };
  });
}
