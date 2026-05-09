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
  return { favorites: [], history: [], positions: {}, comments: [] };
}

function saveUserData(email: string, data: any) {
  ensureDir();
  const file = getUserFile(email);
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf-8");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, email } = body;

    if (!email) {
      return NextResponse.json({ error: "No email" }, { status: 400 });
    }

    // LOAD - get all user data from server
    if (action === "load") {
      const data = getUserData(email);
      return NextResponse.json({ success: true, data });
    }

    // SAVE - save all user data to server
    if (action === "save") {
      const { data } = body;
      if (!data) return NextResponse.json({ error: "No data" }, { status: 400 });

      // Merge strategy: server data + incoming, deduplicate
      const existing = getUserData(email);

      // Merge favorites (by id+type, keep newest)
      const favMap = new Map<string, any>();
      const existFavs = Array.isArray(existing.favorites) ? existing.favorites : [];
      const incomingFavs = Array.isArray(data.favorites) ? data.favorites : [];
      for (const f of existFavs) favMap.set(`${f.type}-${f.id}`, f);
      for (const f of incomingFavs) favMap.set(`${f.type}-${f.id}`, f);
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

      // Merge positions (keep newest savedAt)
      const mergedPositions: any = { ...(existing.positions || {}) };
      for (const [key, val] of Object.entries(data.positions || {})) {
        const existingPos = mergedPositions[key];
        if (!existingPos || (val as any).savedAt > existingPos.savedAt) {
          mergedPositions[key] = val;
        }
      }

      // Merge comments (by id, deduplicate)
      const commentMap = new Map<string, any>();
      const existComments = Array.isArray(existing.comments) ? existing.comments : [];
      const incomingComments = Array.isArray(data.comments) ? data.comments : [];
      for (const c of existComments) commentMap.set(c.id, c);
      for (const c of incomingComments) commentMap.set(c.id, c);
      const mergedComments = Array.from(commentMap.values())
        .sort((a: any, b: any) => b.createdAt - a.createdAt)
        .slice(0, 2000);

      const merged = {
        favorites: mergedFavs,
        history: mergedHistory,
        positions: mergedPositions,
        comments: mergedComments,
      };

      saveUserData(email, merged);
      return NextResponse.json({ success: true, data: merged });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
