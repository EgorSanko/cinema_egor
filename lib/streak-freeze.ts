/**
 * Duolingo-style streak freeze — once per 7 days, the user can mark
 * "yesterday wasn't watched but don't break my streak". We persist the
 * frozen day in localStorage and computeStats consults this list when
 * walking back through the active-days set.
 *
 * Cap: 1 freeze per rolling 7-day window. Simple to game but the cap
 * limits abuse and the visual UX is the reward, not strict accuracy.
 */

const KEY = "kino_streak_freeze_v1";

interface FreezeState {
  // List of ISO date strings (YYYY-MM-DD) that the user has "frozen"
  frozen: string[];
}

function load(): FreezeState {
  if (typeof window === "undefined") return { frozen: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { frozen: [] };
    const parsed = JSON.parse(raw);
    return { frozen: Array.isArray(parsed.frozen) ? parsed.frozen : [] };
  } catch { return { frozen: [] }; }
}

function save(s: FreezeState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch {}
}

export function getFrozenDays(): string[] {
  return load().frozen;
}

/**
 * Can the user freeze today? Returns true if no freeze used in the
 * last 7 days.
 */
export function canFreezeNow(): boolean {
  const s = load();
  const sevenDaysAgo = Date.now() - 7 * 86400_000;
  return !s.frozen.some(d => new Date(d).getTime() >= sevenDaysAgo);
}

/**
 * Freeze a specific date (default yesterday). Returns true on success,
 * false if cap exceeded.
 */
export function freezeDay(date?: Date): boolean {
  if (!canFreezeNow()) return false;
  const d = date ?? new Date(Date.now() - 86400_000);
  d.setHours(0, 0, 0, 0);
  const iso = d.toISOString().slice(0, 10);
  const s = load();
  if (s.frozen.includes(iso)) return false;
  s.frozen.push(iso);
  save(s);
  try { window.dispatchEvent(new Event("streak-freeze-changed")); } catch {}
  return true;
}

/** Days until next freeze available (0 = available now). */
export function daysUntilNextFreeze(): number {
  const s = load();
  if (s.frozen.length === 0) return 0;
  const latest = Math.max(...s.frozen.map(d => new Date(d).getTime()));
  const ageDays = Math.floor((Date.now() - latest) / 86400_000);
  return Math.max(0, 7 - ageDays);
}
