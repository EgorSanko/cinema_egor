import AsyncStorage from '@react-native-async-storage/async-storage';

export interface FavoriteItem {
  id: number;
  type: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date?: string;
  first_air_date?: string;
  addedAt: number;
}

export interface HistoryItem extends FavoriteItem {
  watchedAt: number;
  progress: number;
  duration: number;
  quality?: string;
  season?: number;
  episode?: number;
  translatorName?: string;
  translatorId?: number;
}

export interface Comment {
  id: string;
  mediaId: number;
  mediaType: 'movie' | 'tv';
  author: string;
  text: string;
  rating: number;
  createdAt: number;
}

const FAVORITES_KEY = 'kino_favorites';
const HISTORY_KEY = 'kino_history';
const POSITIONS_KEY = 'kino_positions';
const COMMENTS_KEY = 'kino_comments';

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch { return fallback; }
}

// ── Favorites ──
export async function getFavorites(): Promise<FavoriteItem[]> {
  try {
    return safeParse<FavoriteItem[]>(await AsyncStorage.getItem(FAVORITES_KEY), []);
  } catch { return []; }
}

export async function toggleFavorite(item: FavoriteItem): Promise<boolean> {
  try {
    const favs = await getFavorites();
    const idx = favs.findIndex(f => f.id === item.id && f.type === item.type);
    if (idx >= 0) {
      favs.splice(idx, 1);
      await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
      return false;
    }
    favs.unshift({ ...item, addedAt: Date.now() });
    await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    return true;
  } catch { return false; }
}

export async function isFavorite(id: number, type: string): Promise<boolean> {
  try {
    const favs = await getFavorites();
    return favs.some(f => f.id === id && f.type === type);
  } catch { return false; }
}

// ── History ──
export async function getHistory(): Promise<HistoryItem[]> {
  try {
    return safeParse<HistoryItem[]>(await AsyncStorage.getItem(HISTORY_KEY), []);
  } catch { return []; }
}

export async function addToHistory(item: HistoryItem) {
  try {
    const hist = await getHistory();
    // For TV shows, match by id+type+season+episode so episodes update the same entry
    // For movies, match by id+type only
    const idx = hist.findIndex(h => {
      if (h.id !== item.id || h.type !== item.type) return false;
      if (item.type === 'tv') {
        return h.season === item.season && h.episode === item.episode;
      }
      return true;
    });
    if (idx >= 0) hist.splice(idx, 1);
    hist.unshift({ ...item, watchedAt: Date.now() });
    if (hist.length > 100) hist.length = 100;
    await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(hist));
  } catch {}
}

// ── Positions ──
export async function savePosition(id: number, type: string, time: number, duration: number) {
  try {
    const positions = safeParse<Record<string, any>>(await AsyncStorage.getItem(POSITIONS_KEY), {});
    positions[`${type}_${id}`] = { time, duration, savedAt: Date.now() };
    await AsyncStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
  } catch {}
}

export async function getPosition(id: number, type: string): Promise<{ time: number; duration: number } | null> {
  try {
    const positions = safeParse<Record<string, any>>(await AsyncStorage.getItem(POSITIONS_KEY), {});
    return positions[`${type}_${id}`] || null;
  } catch { return null; }
}

export async function getAllPositions(): Promise<Record<string, any>> {
  try {
    return safeParse<Record<string, any>>(await AsyncStorage.getItem(POSITIONS_KEY), {});
  } catch { return {}; }
}

// ── Comments ──
export async function getComments(mediaId: number, mediaType: string): Promise<Comment[]> {
  try {
    const all = safeParse<Comment[]>(await AsyncStorage.getItem(COMMENTS_KEY), []);
    return all.filter(c => c.mediaId === mediaId && c.mediaType === mediaType);
  } catch { return []; }
}

export async function getAllComments(): Promise<Comment[]> {
  try {
    return safeParse<Comment[]>(await AsyncStorage.getItem(COMMENTS_KEY), []);
  } catch { return []; }
}

export async function addComment(comment: Omit<Comment, 'id' | 'createdAt'>): Promise<Comment> {
  const all = await getAllComments();
  const newComment: Comment = {
    ...comment,
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
  };
  all.unshift(newComment);
  await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(all));
  return newComment;
}

export async function deleteComment(id: string) {
  try {
    const all = await getAllComments();
    const filtered = all.filter(c => c.id !== id);
    await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(filtered));
  } catch {}
}

// ── Bulk set (for sync) ──
export async function setFavorites(items: FavoriteItem[]) {
  await AsyncStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
}
export async function setHistory(items: HistoryItem[]) {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(items));
}
export async function setPositions(positions: Record<string, any>) {
  await AsyncStorage.setItem(POSITIONS_KEY, JSON.stringify(positions));
}
export async function setComments(comments: Comment[]) {
  await AsyncStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
}

// === LAST TRANSLATOR ===
const TRIED_TRANSLATORS_KEY = 'kino_tried_translators';

export async function saveLastTranslator(mediaId: number, mediaType: 'movie' | 'tv', translatorId: number, translatorName?: string) {
  await AsyncStorage.setItem(`last-tr-${mediaType}-${mediaId}`, JSON.stringify({ id: translatorId, name: translatorName || '' }));
  if (translatorName) {
    try {
      const raw = await AsyncStorage.getItem(TRIED_TRANSLATORS_KEY);
      const list: string[] = raw ? JSON.parse(raw) : [];
      if (!list.includes(translatorName)) {
        list.push(translatorName);
        await AsyncStorage.setItem(TRIED_TRANSLATORS_KEY, JSON.stringify(list));
      }
    } catch {}
  }
}

export async function getTriedTranslators(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(TRIED_TRANSLATORS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

// Record any translator the user has watched with — used for Polyglot achievement.
// Called every time a stream loads so even default dubs count.
export async function recordTranslatorTry(translatorName: string) {
  if (!translatorName) return;
  try {
    const raw = await AsyncStorage.getItem(TRIED_TRANSLATORS_KEY);
    const list: string[] = raw ? JSON.parse(raw) : [];
    if (!list.includes(translatorName)) {
      list.push(translatorName);
      await AsyncStorage.setItem(TRIED_TRANSLATORS_KEY, JSON.stringify(list));
    }
  } catch {}
}

export async function getLastTranslator(mediaId: number, mediaType: 'movie' | 'tv'): Promise<{ id: number; name: string } | null> {
  try {
    const data = await AsyncStorage.getItem(`last-tr-${mediaType}-${mediaId}`);
    if (!data) return null;
    return JSON.parse(data);
  } catch { return null; }
}
