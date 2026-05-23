/**
 * User-created lists ("Мои подборки"). Letterboxd-style.
 * Local-first: stored in localStorage + synced via /api/sync.
 *
 * Each list has a short URL-safe id so it can be shared as
 * /list/<id>.
 */

export interface ListItem {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
}

export interface UserList {
  id: string;          // short URL-safe id
  name: string;
  description?: string;
  items: ListItem[];
  createdAt: number;
  updatedAt: number;
  authorEmail?: string; // populated server-side via friendCode lookup
}

const KEY = "kino_lists_v1";

export function getLists(): UserList[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveLists(lists: UserList[]) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(KEY, JSON.stringify(lists.slice(0, 50))); } catch {}
  try { window.dispatchEvent(new Event("lists-changed")); } catch {}
}

function shortId(): string {
  // 8 char URL-safe — short enough for nice URLs
  return Math.random().toString(36).slice(2, 6) + Math.random().toString(36).slice(2, 6);
}

export function createList(name: string, description?: string): UserList {
  const now = Date.now();
  const list: UserList = { id: shortId(), name, description, items: [], createdAt: now, updatedAt: now };
  const lists = getLists();
  lists.unshift(list);
  saveLists(lists);
  return list;
}

export function updateList(id: string, patch: Partial<UserList>): void {
  const lists = getLists();
  const idx = lists.findIndex(l => l.id === id);
  if (idx < 0) return;
  lists[idx] = { ...lists[idx], ...patch, updatedAt: Date.now() };
  saveLists(lists);
}

export function deleteList(id: string): void {
  saveLists(getLists().filter(l => l.id !== id));
}

export function addToList(listId: string, item: ListItem): void {
  const lists = getLists();
  const l = lists.find(x => x.id === listId);
  if (!l) return;
  if (l.items.find(x => x.id === item.id && x.type === item.type)) return;
  l.items.unshift(item);
  l.updatedAt = Date.now();
  saveLists(lists);
}

export function removeFromList(listId: string, itemId: number, itemType: string): void {
  const lists = getLists();
  const l = lists.find(x => x.id === listId);
  if (!l) return;
  l.items = l.items.filter(x => !(x.id === itemId && x.type === itemType));
  l.updatedAt = Date.now();
  saveLists(lists);
}
