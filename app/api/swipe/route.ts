import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const ROOMS_DIR = path.join(process.cwd(), "swipe-rooms");
const API_BASE = process.env.NEXT_PUBLIC_TMDB_BASE_URL;
const API_KEY = process.env.NEXT_PUBLIC_TMDB_API_KEY;

function ensureDir() {
  if (!fs.existsSync(ROOMS_DIR)) fs.mkdirSync(ROOMS_DIR, { recursive: true });
}

function getRoomFile(code: string): string {
  return path.join(ROOMS_DIR, `${code}.json`);
}

function getRoom(code: string): any | null {
  ensureDir();
  const file = getRoomFile(code);
  try {
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {}
  return null;
}

function saveRoom(code: string, data: any) {
  ensureDir();
  fs.writeFileSync(getRoomFile(code), JSON.stringify(data, null, 2), "utf-8");
}

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function randomPage(): number {
  return Math.floor(Math.random() * 20) + 1;
}

async function fetchWithTimeout(url: string, timeoutMs: number = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMoviesByGenres(genreIds: number[], pages: number = 3, useOr: boolean = false): Promise<any[]> {
  if (!API_BASE || !API_KEY || genreIds.length === 0) return [];
  const separator = useOr ? "|" : ",";
  const results: any[] = [];
  const usedPages = new Set<number>();
  for (let i = 0; i < pages; i++) {
    let page = randomPage();
    while (usedPages.has(page)) page = randomPage();
    usedPages.add(page);
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/discover/movie?api_key=${API_KEY}&language=ru-RU&sort_by=popularity.desc&with_genres=${genreIds.join(separator)}&vote_count.gte=50&page=${page}`
      );
      const data = await res.json();
      if (data.results) results.push(...data.results.map((m: any) => ({ ...m, type: "movie" })));
    } catch {}
  }
  return results;
}

async function fetchTVByGenres(genreIds: number[], pages: number = 2, useOr: boolean = false): Promise<any[]> {
  if (!API_BASE || !API_KEY || genreIds.length === 0) return [];
  const tvGenreMap: Record<number, number> = { 28: 10759, 12: 10759, 14: 10765, 878: 10765, 10752: 10768 };
  const tvGenreIds = [...new Set(genreIds.map(id => tvGenreMap[id] || id))];
  const separator = useOr ? "|" : ",";
  const results: any[] = [];
  const usedPages = new Set<number>();
  for (let i = 0; i < pages; i++) {
    let page = randomPage();
    while (usedPages.has(page)) page = randomPage();
    usedPages.add(page);
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/discover/tv?api_key=${API_KEY}&language=ru-RU&sort_by=popularity.desc&with_genres=${tvGenreIds.join(separator)}&vote_count.gte=30&page=${page}`
      );
      const data = await res.json();
      if (data.results) results.push(...data.results.map((t: any) => ({ ...t, title: t.name, type: "tv" })));
    } catch {}
  }
  return results;
}

async function fetchRecommendations(matchedMovies: any[]): Promise<any[]> {
  if (!API_BASE || !API_KEY || matchedMovies.length === 0) return [];
  const results: any[] = [];
  const seen = new Set(matchedMovies.map(m => `${m.type}-${m.id}`));

  for (const match of matchedMovies.slice(0, 5)) {
    const mediaType = match.type === "tv" ? "tv" : "movie";
    try {
      const res = await fetchWithTimeout(
        `${API_BASE}/${mediaType}/${match.id}/recommendations?api_key=${API_KEY}&language=ru-RU&page=1`
      );
      const data = await res.json();
      for (const item of (data.results || []).slice(0, 6)) {
        const key = `${mediaType}-${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            id: item.id, title: item.title || item.name, poster_path: item.poster_path,
            vote_average: item.vote_average || 0, release_date: item.release_date || item.first_air_date,
            overview: item.overview || "", type: mediaType, basedOn: match.title,
          });
        }
      }
    } catch {}
    try {
      const res2 = await fetchWithTimeout(
        `${API_BASE}/${mediaType}/${match.id}/similar?api_key=${API_KEY}&language=ru-RU&page=1`
      );
      const data2 = await res2.json();
      for (const item of (data2.results || []).slice(0, 4)) {
        const key = `${mediaType}-${item.id}`;
        if (!seen.has(key)) {
          seen.add(key);
          results.push({
            id: item.id, title: item.title || item.name, poster_path: item.poster_path,
            vote_average: item.vote_average || 0, release_date: item.release_date || item.first_air_date,
            overview: item.overview || "", type: mediaType, basedOn: match.title,
          });
        }
      }
    } catch {}
  }

  return results
    .filter(r => r.poster_path)
    .sort((a, b) => b.vote_average - a.vote_average)
    .slice(0, 15);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "create") {
      const { playerName } = body;
      if (!playerName) return NextResponse.json({ error: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u0438\u043c\u044f" }, { status: 400 });
      let code = generateCode();
      while (getRoom(code)) code = generateCode();
      const room = {
        code, createdAt: Date.now(), phase: "genres",
        players: { [playerName]: { name: playerName, genres: [], likes: [], dislikes: [], done: false, genresDone: false } },
        movieData: {}, movieIds: [],
      };
      saveRoom(code, room);
      return NextResponse.json({ success: true, code, room });
    }

    if (action === "join") {
      const { code, playerName } = body;
      if (!code || !playerName) return NextResponse.json({ error: "\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0438 \u0438\u043c\u044f" }, { status: 400 });
      const room = getRoom(code.toUpperCase());
      if (!room) return NextResponse.json({ error: "\u041a\u043e\u043c\u043d\u0430\u0442\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430" }, { status: 404 });
      const playerKeys = Object.keys(room.players);
      if (playerKeys.length >= 2 && !room.players[playerName])
        return NextResponse.json({ error: "\u041a\u043e\u043c\u043d\u0430\u0442\u0430 \u0443\u0436\u0435 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d\u0430" }, { status: 400 });
      if (!room.players[playerName]) {
        room.players[playerName] = { name: playerName, genres: [], likes: [], dislikes: [], done: false, genresDone: false };
        saveRoom(code.toUpperCase(), room);
      }
      return NextResponse.json({ success: true, room });
    }

    if (action === "genres") {
      const { code, playerName, genres } = body;
      if (!code || !playerName) return NextResponse.json({ error: "Missing data" }, { status: 400 });
      const room = getRoom(code);
      if (!room || !room.players[playerName]) return NextResponse.json({ error: "\u041e\u0448\u0438\u0431\u043a\u0430" }, { status: 400 });

      room.players[playerName].genres = genres || [];
      room.players[playerName].genresDone = true;

      const playerKeys = Object.keys(room.players);
      const allGenresDone = playerKeys.length >= 2 && playerKeys.every(k => room.players[k].genresDone);

      if (allGenresDone) {
        const [p1, p2] = playerKeys;
        const g1 = new Set(room.players[p1].genres as number[]);
        const g2 = new Set(room.players[p2].genres as number[]);
        const shared = [...g1].filter(g => g2.has(g));
        const allGenres = [...new Set([...g1, ...g2])];

        let sharedMovies: any[] = [];
        let sharedTV: any[] = [];
        let allMovies: any[] = [];
        let allTV: any[] = [];

        try {
          if (shared.length > 0) {
            // Shared genres: AND for shared, OR for all combined
            [sharedMovies, sharedTV, allMovies, allTV] = await Promise.all([
              fetchMoviesByGenres(shared, 3, false),
              fetchTVByGenres(shared, 2, false),
              fetchMoviesByGenres(allGenres, 2, true),
              fetchTVByGenres(allGenres, 1, true),
            ]);
          } else {
            // No shared genres: OR from all combined genres
            [allMovies, allTV] = await Promise.all([
              fetchMoviesByGenres(allGenres, 4, true),
              fetchTVByGenres(allGenres, 2, true),
            ]);
          }
        } catch (e) {
          console.error("TMDB fetch error:", e);
        }

        const seen = new Set<string>();
        const deck: any[] = [];
        for (const m of [...sharedMovies, ...sharedTV]) {
          const key = `${m.type}-${m.id}`;
          if (!seen.has(key) && m.poster_path) { seen.add(key); deck.push({ ...m, sharedGenre: true }); }
        }
        for (const m of [...allMovies, ...allTV]) {
          const key = `${m.type}-${m.id}`;
          if (!seen.has(key) && m.poster_path) { seen.add(key); deck.push({ ...m, sharedGenre: false }); }
        }

        // Fisher-Yates shuffle
        for (let i = deck.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [deck[i], deck[j]] = [deck[j], deck[i]];
        }

        // Interleave: shared first
        const sh = deck.filter(m => m.sharedGenre);
        const ot = deck.filter(m => !m.sharedGenre);
        const final: any[] = [];
        let si = 0, oi = 0;
        while ((si < sh.length || oi < ot.length) && final.length < 30) {
          if (si < sh.length) final.push(sh[si++]);
          if (oi < ot.length) final.push(ot[oi++]);
          if (si < sh.length) final.push(sh[si++]);
        }

        for (const m of final) {
          room.movieData[`${m.type}-${m.id}`] = {
            id: m.id, title: m.title || m.name, poster_path: m.poster_path,
            vote_average: m.vote_average || 0, release_date: m.release_date || m.first_air_date,
            overview: m.overview || "", type: m.type, genre_ids: m.genre_ids || [], sharedGenre: m.sharedGenre,
          };
        }
        room.movieIds = final.map((m: any) => `${m.type}-${m.id}`);
        room.phase = "swiping";
        room.sharedGenres = shared;
        room.allGenres = allGenres;
      }

      saveRoom(code, room);
      return NextResponse.json({ success: true, allGenresDone, phase: room.phase });
    }

    if (action === "deck") {
      const { code } = body;
      const room = getRoom(code);
      if (!room) return NextResponse.json({ error: "\u041a\u043e\u043c\u043d\u0430\u0442\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430" }, { status: 404 });
      const movies = (room.movieIds || []).map((key: string) => room.movieData[key]).filter(Boolean);
      return NextResponse.json({ success: true, movies, phase: room.phase });
    }

    if (action === "swipe") {
      const { code, playerName, movieKey, direction } = body;
      if (!code || !playerName || !movieKey || !direction)
        return NextResponse.json({ error: "Missing data" }, { status: 400 });
      const room = getRoom(code);
      if (!room || !room.players[playerName]) return NextResponse.json({ error: "\u041e\u0448\u0438\u0431\u043a\u0430" }, { status: 400 });
      if (direction === "right") {
        if (!room.players[playerName].likes.includes(movieKey)) room.players[playerName].likes.push(movieKey);
      } else {
        if (!room.players[playerName].dislikes.includes(movieKey)) room.players[playerName].dislikes.push(movieKey);
      }
      saveRoom(code, room);
      return NextResponse.json({ success: true });
    }

    if (action === "done") {
      const { code, playerName } = body;
      const room = getRoom(code);
      if (!room || !room.players[playerName]) return NextResponse.json({ error: "\u041e\u0448\u0438\u0431\u043a\u0430" }, { status: 400 });
      room.players[playerName].done = true;
      const playerKeys = Object.keys(room.players);
      if (playerKeys.length >= 2 && playerKeys.every(k => room.players[k].done)) room.phase = "results";
      saveRoom(code, room);
      return NextResponse.json({ success: true });
    }

    if (action === "status") {
      const { code } = body;
      const room = getRoom(code);
      if (!room) return NextResponse.json({ error: "\u041a\u043e\u043c\u043d\u0430\u0442\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430" }, { status: 404 });

      const playerKeys = Object.keys(room.players);
      const bothJoined = playerKeys.length >= 2;
      let matches: any[] = [], compatibility = 0, genreCompatibility = 0;
      let sharedGenres: number[] = room.sharedGenres || [];
      let recommendations: any[] = [];

      if (bothJoined) {
        const [p1, p2] = playerKeys;
        const likes1 = new Set(room.players[p1].likes);
        const likes2 = new Set(room.players[p2].likes);
        const dislikes1 = new Set(room.players[p1].dislikes);
        const dislikes2 = new Set(room.players[p2].dislikes);

        matches = [...likes1].filter(k => likes2.has(k)).map(k => room.movieData?.[k]).filter(Boolean);

        const allKeys = new Set([...likes1, ...dislikes1, ...likes2, ...dislikes2]);
        let agree = 0, total = 0;
        for (const key of allKeys) {
          if ((likes1.has(key) || dislikes1.has(key)) && (likes2.has(key) || dislikes2.has(key))) {
            total++;
            if ((likes1.has(key) && likes2.has(key)) || (dislikes1.has(key) && dislikes2.has(key))) agree++;
          }
        }
        compatibility = total > 0 ? Math.round((agree / total) * 100) : 0;

        const g1 = new Set(room.players[p1].genres || []);
        const g2 = new Set(room.players[p2].genres || []);
        const allG = new Set([...g1, ...g2]);
        genreCompatibility = allG.size > 0 ? Math.round(([...g1].filter(g => g2.has(g)).length / allG.size) * 100) : 0;

        const allDone = playerKeys.every(k => room.players[k].done);
        if (allDone && matches.length > 0) {
          if (!room.recommendations) {
            const swiped = new Set(room.movieIds || []);
            room.recommendations = (await fetchRecommendations(matches)).filter(r => !swiped.has(`${r.type}-${r.id}`));
            saveRoom(code, room);
          }
          recommendations = room.recommendations || [];
        }
      }

      return NextResponse.json({
        success: true, code: room.code, phase: room.phase || "genres", bothJoined,
        allGenresDone: playerKeys.length >= 2 && playerKeys.every(k => room.players[k].genresDone),
        allDone: playerKeys.length >= 2 && playerKeys.every(k => room.players[k].done),
        matches, matchCount: matches.length, compatibility, genreCompatibility, sharedGenres,
        players: Object.fromEntries(playerKeys.map(k => [k, {
          name: room.players[k].name, genres: room.players[k].genres || [],
          genresDone: room.players[k].genresDone || false,
          liked: room.players[k].likes.length,
          total: room.players[k].likes.length + room.players[k].dislikes.length,
          done: room.players[k].done,
        }])),
        totalMovies: (room.movieIds || []).length,
        recommendations,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    console.error("Swipe API error:", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
