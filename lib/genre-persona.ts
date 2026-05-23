/**
 * TMDB genre id → Russian name + personality archetype for the
 * "Твоя киноДНК" card on the profile. Hardcoded so we don't have to
 * fetch /genre/movie/list and /genre/tv/list at every profile load
 * (the lists rarely change and the round-trip would slow the page).
 *
 * Includes BOTH movie and TV genres — some ids overlap, some don't.
 * If a future genre appears in history that's not here, it just won't
 * count toward "byGenre" (better than crashing the breakdown).
 */

export const GENRES: Record<number, { name: string; persona: string; emoji: string; tagline: string }> = {
  // ── Movie genres ──
  28:    { name: "Боевик",         persona: "Адреналинщик",        emoji: "💥", tagline: "Любишь когда стены трещат" },
  12:    { name: "Приключения",    persona: "Искатель",            emoji: "🗺️", tagline: "Сердце требует дороги" },
  16:    { name: "Мультфильм",     persona: "Вечный ребёнок",      emoji: "🎨", tagline: "Знаешь толк в магии" },
  35:    { name: "Комедия",        persona: "Хохотун",             emoji: "😂", tagline: "Жизнь — это шутка" },
  80:    { name: "Криминал",       persona: "Кабинетный детектив", emoji: "🕵️", tagline: "Каждый — подозреваемый" },
  99:    { name: "Документальный", persona: "Эрудит",              emoji: "📚", tagline: "Реальность интереснее вымысла" },
  18:    { name: "Драма",          persona: "Эмоционал",           emoji: "🎭", tagline: "Не боишься чувствовать" },
  10751: { name: "Семейный",       persona: "Уютник",              emoji: "🏡", tagline: "Кино под одеялом — лучшая терапия" },
  14:    { name: "Фэнтези",        persona: "Сказочник",           emoji: "🧙", tagline: "Веришь в драконов и магию" },
  36:    { name: "История",        persona: "Историк",             emoji: "📜", tagline: "Прошлое — твоя слабость" },
  27:    { name: "Ужасы",          persona: "Бесстрашный",         emoji: "👻", tagline: "Смотришь сквозь пальцы, но смотришь" },
  10402: { name: "Музыка",         persona: "Меломан",             emoji: "🎵", tagline: "Кино должно звучать" },
  9648:  { name: "Детектив",       persona: "Шерлок",              emoji: "🔍", tagline: "Раскрываешь финал на 10-й минуте" },
  10749: { name: "Мелодрама",      persona: "Романтик",            emoji: "💕", tagline: "Веришь в большую любовь" },
  878:   { name: "Фантастика",     persona: "Космический мечтатель", emoji: "🚀", tagline: "Будущее уже здесь" },
  10770: { name: "Телефильм",      persona: "Зритель",             emoji: "📺", tagline: "Простая радость экрана" },
  53:    { name: "Триллер",        persona: "Параноик",            emoji: "🔪", tagline: "Любишь когда напряжение зашкаливает" },
  10752: { name: "Военный",        persona: "Стратег",             emoji: "⚔️", tagline: "Знаешь цену миру" },
  37:    { name: "Вестерн",        persona: "Ковбой",              emoji: "🤠", tagline: "Закат, прерия, бутылка виски" },

  // ── TV-only genres ──
  10759: { name: "Боевик и Приключения", persona: "Адреналинщик", emoji: "💥", tagline: "Любишь когда стены трещат" },
  10762: { name: "Детский",          persona: "Вечный ребёнок",  emoji: "🎨", tagline: "Знаешь толк в магии" },
  10763: { name: "Новости",          persona: "В курсе",         emoji: "📰", tagline: "Информация — оружие" },
  10764: { name: "Реалити-ТВ",       persona: "Наблюдатель",     emoji: "🎬", tagline: "Чужая жизнь — лучший спектакль" },
  10765: { name: "НФ и Фэнтези",     persona: "Космический мечтатель", emoji: "🚀", tagline: "Будущее уже здесь" },
  10766: { name: "Мыльная опера",    persona: "Романтик",        emoji: "💕", tagline: "Веришь в большую любовь" },
  10767: { name: "Ток-шоу",          persona: "Слушатель",       emoji: "🎙️", tagline: "Любишь хорошие беседы" },
  10768: { name: "Военный и Политика", persona: "Стратег",       emoji: "⚔️", tagline: "Знаешь цену миру" },
};

export function genreName(id: number): string {
  return GENRES[id]?.name ?? "";
}

export function getGenreLookup(): Map<number, string> {
  const map = new Map<number, string>();
  for (const [id, g] of Object.entries(GENRES)) map.set(Number(id), g.name);
  return map;
}

/**
 * Pick a personality verdict based on top genres. If a single genre
 * dominates (>= 40%) → that persona. If two are tied → hybrid.
 * If user is "balanced" (no clear leader) → "Универсальный зритель".
 */
export function pickPersona(
  topGenres: { name: string; count: number; pct: number }[]
): { title: string; emoji: string; tagline: string } {
  if (!topGenres.length) {
    return { title: "Кинопервопроходец", emoji: "🎬", tagline: "Только начинаешь свой путь" };
  }
  const top = topGenres[0];
  // Find genre entry by name (we stored only name+count+pct in topGenres)
  const entry = Object.values(GENRES).find(g => g.name === top.name);
  if (!entry) return { title: "Знаток", emoji: "🎥", tagline: "Твой вкус — загадка" };

  if (top.pct >= 40) {
    return { title: entry.persona, emoji: entry.emoji, tagline: entry.tagline };
  }
  // Two genres ~equal share → hybrid label
  if (topGenres.length >= 2 && topGenres[1].pct >= top.pct - 8) {
    const second = Object.values(GENRES).find(g => g.name === topGenres[1].name);
    if (second) {
      return {
        title: `${entry.persona} × ${second.persona}`,
        emoji: `${entry.emoji}${second.emoji}`,
        tagline: "Сложный микс — кинематографичный гибрид",
      };
    }
  }
  // No clear leader
  return { title: "Универсальный зритель", emoji: "🎟️", tagline: "Смотришь всё подряд — и в этом сила" };
}
