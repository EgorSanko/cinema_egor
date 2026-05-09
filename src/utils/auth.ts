import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../constants/theme';
import { getFavorites, getHistory, getAllPositions, getAllComments, setFavorites, setHistory, setPositions, setComments } from './storage';

const USER_KEY = 'kino_user';

// Simple event system for auth state changes
type AuthListener = (user: User | null) => void;
const authListeners: AuthListener[] = [];
export function onAuthChange(fn: AuthListener) {
  authListeners.push(fn);
  return () => { const idx = authListeners.indexOf(fn); if (idx >= 0) authListeners.splice(idx, 1); };
}
function notifyAuth(user: User | null) { authListeners.forEach(fn => fn(user)); }

export interface User {
  email: string;
  name: string;
}

export async function getUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export async function login(email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', email, password }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  // Sync from server after login
  await syncFromServer(data.user.email);
  return data.user;
}

export async function register(name: string, email: string, password: string): Promise<User> {
  const res = await fetch(`${API_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register', name, email, password }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(data.user));
  return data.user;
}

export async function logout(): Promise<void> {
  // Sync to server before logout
  const user = await getUser();
  if (user) await syncToServer(user.email);
  await AsyncStorage.removeItem(USER_KEY);
  notifyAuth(null);
}

export async function syncToServer(email: string) {
  try {
    const [favorites, history, positions, comments] = await Promise.all([
      getFavorites(), getHistory(), getAllPositions(), getAllComments(),
    ]);
    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'save',
        email,
        data: { favorites, history, positions, comments },
      }),
    });
    return await res.json();
  } catch { return null; }
}

export async function syncFromServer(email: string) {
  try {
    const [favorites, history, positions, comments] = await Promise.all([
      getFavorites(), getHistory(), getAllPositions(), getAllComments(),
    ]);
    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'save', email, data: { favorites, history, positions, comments } }),
    });
    const data = await res.json();
    if (data.success && data.data) {
      if (data.data.favorites) await setFavorites(data.data.favorites);
      if (data.data.history) await setHistory(data.data.history);
      if (data.data.positions) await setPositions(data.data.positions);
      if (data.data.comments) await setComments(data.data.comments);
    }
  } catch {}
}

// Auto-sync — call after significant changes
let syncTimer: ReturnType<typeof setTimeout> | null = null;
export function scheduleSyncToServer() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    const user = await getUser();
    if (user) await syncToServer(user.email);
  }, 3000);
}
