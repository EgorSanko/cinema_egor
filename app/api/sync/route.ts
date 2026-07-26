import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const DATA_DIR = process.env.SYNC_DATA_DIR || path.join(process.cwd(), "user-data");

// Ensure data directory exists
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getUserFile(email: string): string {
  // Sanitize email for filename
  const safe = email.replace(/[^a-zA-Z0-9@._-]/g, "_");
  return path.join(DATA_DIR, `${safe}.json`);
}

function getUserData(email: string): any {
  ensureDir();
  const file = getUserFile(email);
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, "utf-8"));
    }
  } catch {}
  return { favorites: [], history: [], positions: {}, comments: [], lists: [], friendCode: "" };
}

function saveUserData(email: string, data: any) {
  ensureDir();
  const file = getUserFile(email);
  // Auto-generate friend code if missing — used by /compare/[code]
  if (!data.friendCode) {
    data.friendCode = generateFriendCode();
  }
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

function generateFriendCode(): string {
  // 6 chars from a clean alphabet (no I/O/0/1 ambiguity)
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email } = body;

    // email is required for load/save but NOT for friend-lookup (which
    // identifies by code). Moving the check inside the actions that need
    // it — previously every request was rejected with "No email" before
    // friend-lookup could even run, breaking the compare feature.
    const requireEmail = () => {
      if (!email) return NextResponse.json({ error: "No email" }, { status: 400 });
      return null;
    };

    // LOAD - get all user data from server
    if (action === "load") {
      const err = requireEmail(); if (err) return err;
      const data = getUserData(email);
      return NextResponse.json({ success: true, data });
    }

    // RECOGNIZE - есть ли по этой почте профиль просмотров (для «мягких» юзеров
    // без логина: смотрели по остаточной сессии, история копилась по email, но
    // аккаунта нет). Read-only: используется, когда логин вернул «не найден», —
    // чтобы предложить «Мы вас узнали → подтвердите почту» и сохранить историю.
    if (action === "recognize") {
      const err = requireEmail(); if (err) return err;
      const data = getUserData(email);
      const watched = Array.isArray(data.history) ? data.history.length : 0;
      const favorites = Array.isArray(data.favorites) ? data.favorites.length : 0;
      return NextResponse.json({ watched, favorites, hasProfile: watched > 0 || favorites > 0 });
    }

    // SAVE - save all user data to server
    if (action === "save") {
      const err = requireEmail(); if (err) return err;
      const { data } = body;
      if (!data) return NextResponse.json({ error: "No data" }, { status: 400 });

      // Merge strategy: server data + incoming, deduplicate
      const existing = getUserData(email);

      // Favorites are a user-curated set: the client sends its FULL current
      // list, so it's authoritative. Union-merging with the stored copy
      // resurrected items the user just deleted (delete → reappears on next
      // sync). Use incoming as the source of truth; fall back to stored only
      // when the client sent no favorites field at all.
      const incomingFavs = Array.isArray(data.favorites) ? data.favorites : null;
      const favSource = incomingFavs ?? (Array.isArray(existing.favorites) ? existing.favorites : []);
      const favMap = new Map<string, any>();
      for (const f of favSource) favMap.set(`${f.type}-${f.id}`, f);
      const mergedFavs = Array.from(favMap.values())
        .sort((a: any, b: any) => (b.addedAt || 0) - (a.addedAt || 0))
        .slice(0, 200);

      // Merge history (by id+type+season+episode, keep newest)
      const histMap = new Map<string, any>();
      const existHist = Array.isArray(existing.history) ? existing.history : [];
      const incomingHist = Array.isArray(data.history) ? data.history : [];
      for (const h of existHist) {
        const key = `${h.type}-${h.id}-${h.season || 0}-${h.episode || 0}`;
        const prev = histMap.get(key);
        if (!prev || h.watchedAt > prev.watchedAt) histMap.set(key, h);
      }
      for (const h of incomingHist) {
        const key = `${h.type}-${h.id}-${h.season || 0}-${h.episode || 0}`;
        const prev = histMap.get(key);
        if (!prev || h.watchedAt > prev.watchedAt) histMap.set(key, h);
      }
      const mergedHistory = Array.from(histMap.values())
        .sort((a: any, b: any) => b.watchedAt - a.watchedAt)
        .slice(0, 500);

      // Merge positions (keep newest savedAt), then cap to newest 300 so the
      // user-data JSON doesn't grow unbounded (history/downloads are already
      // capped; positions weren't). Досмотренные помечены done:true — надгробия
      // тоже мёржатся/капаются как обычные записи, старые вытеснятся.
      const mergedPositionsAll: any = { ...(existing.positions || {}) };
      for (const [key, val] of Object.entries(data.positions || {})) {
        const existingPos = mergedPositionsAll[key];
        if (!existingPos || (val as any).savedAt > existingPos.savedAt) {
          mergedPositionsAll[key] = val;
        }
      }
      const posEntries = Object.entries(mergedPositionsAll);
      const mergedPositions: any = posEntries.length <= 300
        ? mergedPositionsAll
        : Object.fromEntries(
            posEntries
              .sort((a, b) => ((b[1] as any)?.savedAt || 0) - ((a[1] as any)?.savedAt || 0))
              .slice(0, 300),
          );

      // Merge comments (by id, deduplicate)
      const commentMap = new Map<string, any>();
      const existComments = Array.isArray(existing.comments) ? existing.comments : [];
      const incomingComments = Array.isArray(data.comments) ? data.comments : [];
      for (const c of existComments) commentMap.set(c.id, c);
      for (const c of incomingComments) commentMap.set(c.id, c);
      const mergedComments = Array.from(commentMap.values())
        .sort((a: any, b: any) => b.createdAt - a.createdAt)
        .slice(0, 2000);

      // Merge user-created lists by id, keep latest updatedAt
      const listMap = new Map<string, any>();
      const existLists = Array.isArray(existing.lists) ? existing.lists : [];
      const incomingLists = Array.isArray(data.lists) ? data.lists : [];
      for (const l of existLists) listMap.set(l.id, l);
      for (const l of incomingLists) {
        const prev = listMap.get(l.id);
        if (!prev || (l.updatedAt || 0) > (prev.updatedAt || 0)) listMap.set(l.id, l);
      }
      const mergedLists = Array.from(listMap.values())
        .sort((a: any, b: any) => (b.updatedAt || 0) - (a.updatedAt || 0))
        .slice(0, 50);

      // Statuses: merge by entry key, newest updatedAt wins
      const statusMap: Record<string, any> = { ...(existing.statuses || {}) };
      const incomingStatuses = data.statuses || {};
      for (const [k, v] of Object.entries(incomingStatuses)) {
        const incoming: any = v;
        const cur = statusMap[k];
        if (!cur || (incoming.updatedAt || 0) > (cur.updatedAt || 0)) statusMap[k] = incoming;
      }

      // Merge downloads by (id, type, season, episode, quality) keeping newest
      // downloadedAt. Trim to 500 most recent so the user-data JSON doesn't
      // grow unbounded.
      const dlMap = new Map<string, any>();
      const dlKey = (d: any) => `${d.type}-${d.id}-s${d.season ?? 0}e${d.episode ?? 0}-${d.quality}`;
      const existDls = Array.isArray(existing.downloads) ? existing.downloads : [];
      const incomingDls = Array.isArray(data.downloads) ? data.downloads : [];
      for (const d of existDls) dlMap.set(dlKey(d), d);
      for (const d of incomingDls) {
        const prev = dlMap.get(dlKey(d));
        if (!prev || (d.downloadedAt || 0) > (prev.downloadedAt || 0)) dlMap.set(dlKey(d), d);
      }
      const mergedDownloads = Array.from(dlMap.values())
        .sort((a: any, b: any) => (b.downloadedAt || 0) - (a.downloadedAt || 0))
        .slice(0, 500);

      const merged = {
        favorites: mergedFavs,
        history: mergedHistory,
        positions: mergedPositions,
        comments: mergedComments,
        lists: mergedLists,
        statuses: statusMap,
        downloads: mergedDownloads,
        friendCode: existing.friendCode || generateFriendCode(),
      };

      saveUserData(email, merged);
      return NextResponse.json({ success: true, data: merged });
    }

    // Resolve friend code → return a slim public view of that user's data
    // (just history+favorites, no email). Used by /compare/[code].
    if (action === "friend-lookup") {
      const { code } = body;
      if (!code) return NextResponse.json({ error: "No code" }, { status: 400 });
      ensureDir();
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
      for (const f of files) {
        try {
          const u = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
          if (u.friendCode === code) {
            return NextResponse.json({
              success: true,
              data: {
                history: u.history || [],
                favorites: u.favorites || [],
                friendCode: u.friendCode,
              },
            });
          }
        } catch {}
      }
      return NextResponse.json({ error: "Не найдено" }, { status: 404 });
    }

    // Public list lookup — anyone can fetch a list by its id without auth.
    // Used by /list/[id] when the visitor doesn't own the list locally.
    if (action === "list-lookup") {
      const { listId } = body;
      if (!listId) return NextResponse.json({ error: "No listId" }, { status: 400 });
      ensureDir();
      const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith(".json"));
      for (const f of files) {
        try {
          const u = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), "utf-8"));
          const list = (u.lists || []).find((l: any) => l.id === listId);
          if (list) {
            return NextResponse.json({ success: true, data: list });
          }
        } catch {}
      }
      return NextResponse.json({ error: "Список не найден" }, { status: 404 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
