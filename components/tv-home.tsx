// === КУДА ПОЛОЖИТЬ: components/tv-home.tsx ===
// Главный клиентский компонент TV-интерфейса
// Полная навигация пультом (D-pad), реальные данные TMDB, HLS стриминг, storage
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import type { Movie, TVShow } from "@/lib/tmdb";
import { getImageUrl, getBackdropUrl } from "@/lib/tmdb";
import {
  getHistory,
  toggleFavorite,
  isFavorite,
  addToHistory,
  savePosition,
  getPosition,
  type HistoryItem,
} from "@/lib/storage";
import Hls from "hls.js";

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

interface TVHomeProps {
  trendingMovies: Movie[];
  popularMovies: Movie[];
  latestMovies: Movie[];
  trendingTV: TVShow[];
  popularTV: TVShow[];
}

interface Item {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  backdrop_path?: string | null;
  overview?: string;
  year: string;
  rating: number;
  progress?: number;
  isSeries?: boolean;
  season?: number;
  episode?: number;
}

interface Row {
  id: string;
  title: string;
  icon: string;
  items: Item[];
}

// ═══════════════════════════════════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════════════════════════════════

const SIDEBAR = [
  { id: "home", label: "Главная", d: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" },
  { id: "search", label: "Поиск", d: "M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" },
  { id: "catalog", label: "Каталог", d: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" },
  { id: "series", label: "Сериалы", d: "M2 7h20v13a2 2 0 01-2 2H4a2 2 0 01-2-2V7zM17 2l-5 5-5-5" },
  { id: "fav", label: "Избранное", d: "M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" },
  { id: "hist", label: "История", d: "M12 22a10 10 0 100-20 10 10 0 000 20zM12 6v6l4 2" },
  { id: "set", label: "Настройки", d: "M12 15a3 3 0 100-6 3 3 0 000 6z" },
];

const Ic = ({ d }: { d: string }) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d={d} />
  </svg>
);

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

const toItem = (m: Movie): Item => ({
  id: m.id, type: "movie", title: m.title, poster_path: m.poster_path,
  backdrop_path: m.backdrop_path, overview: m.overview,
  year: m.release_date?.slice(0, 4) || "", rating: +(m.vote_average.toFixed(1)),
});

const tvToItem = (t: TVShow): Item => ({
  id: t.id, type: "tv", title: t.name, poster_path: t.poster_path,
  backdrop_path: t.backdrop_path, overview: t.overview,
  year: t.first_air_date?.slice(0, 4) || "", rating: +(t.vote_average.toFixed(1)),
  isSeries: true,
});

const histItem = (h: HistoryItem): Item => ({
  id: h.id, type: h.type, title: h.title, poster_path: h.poster_path,
  year: "", rating: +(h.vote_average?.toFixed(1) || "0"),
  progress: h.duration > 0 ? Math.round((h.progress / h.duration) * 100) : 0,
  isSeries: h.type === "tv", season: h.season, episode: h.episode,
});

const fmtT = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const SB_W = 72, SB_EX = 230;

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

export function TVHome({ trendingMovies, popularMovies, latestMovies, trendingTV, popularTV }: TVHomeProps) {

  // ── Build rows ──
  const [contItems, setContItems] = useState<Item[]>([]);
  useEffect(() => {
    const h = getHistory();
    setContItems(h.filter(x => x.duration > 0 && x.progress / x.duration < 0.95 && x.progress > 30).slice(0, 10).map(histItem));
  }, []);

  const rows: Row[] = [
    ...(contItems.length > 0 ? [{ id: "cont", title: "Продолжить просмотр", icon: "▶", items: contItems }] : []),
    { id: "trend", title: "Сейчас в тренде", icon: "🔥", items: trendingMovies.slice(0, 15).map(toItem) },
    { id: "new", title: "Новинки", icon: "✦", items: latestMovies.slice(0, 15).map(toItem) },
    { id: "trtv", title: "Популярные сериалы", icon: "📺", items: trendingTV.slice(0, 15).map(tvToItem) },
    { id: "pop", title: "Популярные фильмы", icon: "⭐", items: popularMovies.slice(0, 15).map(toItem) },
    { id: "ptv", title: "Сериалы в тренде", icon: "📡", items: popularTV.slice(0, 15).map(tvToItem) },
  ];

  const hero = trendingMovies[0] ? toItem(trendingMovies[0]) : null;

  // ── Nav state ──
  type Zone = "sb" | "hero" | "rows" | "det" | "play";
  const [z, setZ] = useState<Zone>("hero");
  const [si, setSi] = useState(0);        // sidebar index
  const [so, setSo] = useState(false);     // sidebar open
  const [hb, setHb] = useState(0);        // hero button
  const [ri, setRi] = useState(0);        // row index
  const [ci, setCi] = useState(0);        // col index
  const [det, setDet] = useState<Item | null>(null);
  const [db, setDb] = useState(0);        // detail button
  const [toast, setToast] = useState<string | null>(null);

  // ── Player state ──
  const [play, setPlay] = useState(false);
  const [pb, setPb] = useState(2);         // player button
  const [paused, setPaused] = useState(false);
  const [pt, setPt] = useState(0);         // player time
  const [pd, setPd] = useState(0);         // player duration
  const [pLoad, setPLoad] = useState(false);
  const [pErr, setPErr] = useState("");
  const [sd, setSd] = useState<any>(null); // stream data
  const [sq, setSq] = useState("");        // selected quality
  const [trs, setTrs] = useState<any[]>([]);
  const [selTr, setSelTr] = useState<number | null>(null);
  const [qPick, setQPick] = useState(false);
  const [tPick, setTPick] = useState(false);

  const vRef = useRef<HTMLVideoElement>(null);
  const hlsR = useRef<Hls | null>(null);
  const svInt = useRef<any>(null);
  const cMem = useRef<Record<number, number>>({});
  const rRefs = useRef<(HTMLDivElement | null)[]>([]);
  const mRef = useRef<HTMLDivElement>(null);

  const flash = useCallback((m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); }, []);

  // ── Scroll ──
  const sRow = useCallback((r: number, c: number) => {
    const el = rRefs.current[r];
    if (!el?.children[c]) return;
    const off = (el.children[c] as HTMLElement).getBoundingClientRect().left - el.getBoundingClientRect().left - 80;
    el.scrollTo({ left: Math.max(0, el.scrollLeft + off), behavior: "smooth" });
  }, []);
  const sMain = useCallback((r: number) => {
    mRef.current?.scrollTo({ top: Math.max(0, 460 + r * 310 - 120), behavior: "smooth" });
  }, []);

  // ── Open detail ──
  const openDet = useCallback((it: Item) => {
    setDet(it); setDb(0); setZ("det"); setSd(null); setTrs([]); setSelTr(null); setPErr("");
  }, []);

  // ── Stream fetch ──
  const fetchStr = useCallback(async (it: Item, trId?: number | null) => {
    setPLoad(true); setPErr("");
    if (!trId) setSd(null);
    try {
      const q = encodeURIComponent(it.title);
      let u = `/hdrezka/api/search?q=${q}&year=${it.year}&type=${it.type}`;
      const s = it.season || (it.type === "tv" ? 1 : undefined);
      const e = it.episode || (it.type === "tv" ? 1 : undefined);
      if (it.type === "tv") u += `&season=${s}&episode=${e}`;
      if (trId) u += `&translator_id=${trId}`;
      const res = await fetch(u);
      const d = await res.json();
      if (d.stream) {
        setSd(d); setSq(d.quality || "");
        if (d.translators?.length > 0 && !trId) { setTrs(d.translators); setSelTr(d.translators[0].id); }
        return true;
      }
      if (d.results?.length > 0) {
        for (let i = 0; i < Math.min(d.results.length, 5); i++) {
          const r2 = await fetch(u + `&index=${i}`);
          const d2 = await r2.json();
          if (d2.stream) {
            setSd(d2); setSq(d2.quality || "");
            if (d2.translators?.length > 0 && !trId) { setTrs(d2.translators); setSelTr(d2.translators[0].id); }
            return true;
          }
        }
      }
      setPErr("Контент пока недоступен");
      return false;
    } catch { setPErr("Сервер не отвечает"); return false; }
    finally { setPLoad(false); }
  }, []);

  // ── Load HLS ──
  const loadStr = useCallback((url: string, seekTo?: number) => {
    if (!vRef.current) return;
    const v = vRef.current;
    if (hlsR.current) { hlsR.current.destroy(); hlsR.current = null; }
    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsR.current = hls;
      hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (seekTo && seekTo > 0) v.currentTime = seekTo;
        v.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_, data) => { if (data.fatal) setPErr("Ошибка воспроизведения"); });
    } else {
      v.src = url;
      v.onloadedmetadata = () => { if (seekTo && seekTo > 0) v.currentTime = seekTo; v.play().catch(() => {}); };
    }
  }, []);

  // Auto-load stream
  useEffect(() => {
    if (sd?.stream && vRef.current && play) {
      const pos = det ? getPosition(det.id, det.type, det.season, det.episode) : null;
      loadStr(sd.stream, pos && pos.time > 10 ? pos.time : undefined);
    }
  }, [sd, play, det, loadStr]);

  // Start player
  const startPlay = useCallback(async () => {
    if (!det) return;
    setPlay(true); setPaused(false); setPt(0); setPd(0); setPb(2); setZ("play"); setQPick(false); setTPick(false);
    await fetchStr(det);
  }, [det, fetchStr]);

  // Stop player
  const stopPlay = useCallback(() => {
    if (vRef.current && det) {
      savePosition(det.id, det.type, vRef.current.currentTime, vRef.current.duration, det.season, det.episode);
      vRef.current.pause(); vRef.current.src = "";
    }
    if (hlsR.current) { hlsR.current.destroy(); hlsR.current = null; }
    setPlay(false); setSd(null); setZ("det");
  }, [det]);

  // Save interval
  useEffect(() => {
    if (!play || !det) return;
    svInt.current = setInterval(() => {
      if (vRef.current && !vRef.current.paused) {
        const ct = vRef.current.currentTime, dur = vRef.current.duration;
        if (ct > 0 && dur > 0) {
          savePosition(det.id, det.type, ct, dur, det.season, det.episode);
          addToHistory({ id: det.id, type: det.type, title: det.title, poster_path: det.poster_path, vote_average: det.rating, watchedAt: Date.now(), progress: ct, duration: dur, quality: sq, season: det.season, episode: det.episode });
        }
      }
    }, 5000);
    return () => { if (svInt.current) clearInterval(svInt.current); };
  }, [play, det, sq]);

  // Video events
  useEffect(() => {
    if (!play || !vRef.current) return;
    const v = vRef.current;
    const onT = () => { setPt(Math.floor(v.currentTime)); setPd(Math.floor(v.duration || 0)); setPaused(v.paused); };
    const onP = () => setPaused(false);
    const onPs = () => setPaused(true);
    v.addEventListener("timeupdate", onT); v.addEventListener("play", onP); v.addEventListener("pause", onPs);
    return () => { v.removeEventListener("timeupdate", onT); v.removeEventListener("play", onP); v.removeEventListener("pause", onPs); };
  }, [play]);

  useEffect(() => { return () => { if (hlsR.current) hlsR.current.destroy(); }; }, []);

  const chgQ = useCallback((q: string) => {
    if (!sd?.streams?.[q]) return;
    const ct = vRef.current?.currentTime || 0;
    setSq(q); loadStr(sd.streams[q], ct); setQPick(false); flash(`Качество: ${q}`);
  }, [sd, loadStr, flash]);

  const chgTr = useCallback(async (tid: number) => {
    if (!det || tid === selTr) { setTPick(false); return; }
    setSelTr(tid); setTPick(false);
    const ct = vRef.current?.currentTime || 0;
    setPLoad(true); await fetchStr(det, tid);
    setTimeout(() => { if (vRef.current && ct > 0) vRef.current.currentTime = ct; }, 500);
  }, [det, selTr, fetchStr]);

  // ══════════ KEYBOARD ══════════
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const k = e.key;
      if (["F5", "F11", "F12"].includes(k)) return;
      e.preventDefault();

      // PLAYER
      if (z === "play") {
        if (qPick) {
          const qs = sd?.streams ? Object.keys(sd.streams) : [];
          const qi = qs.indexOf(sq);
          if (k === "ArrowUp" && qi > 0) setSq(qs[qi - 1]);
          if (k === "ArrowDown" && qi < qs.length - 1) setSq(qs[qi + 1]);
          if (k === "Enter" || k === " ") chgQ(sq);
          if (["Escape", "Backspace"].includes(k)) setQPick(false);
          return;
        }
        if (tPick) {
          const ti = trs.findIndex((t: any) => t.id === selTr);
          if (k === "ArrowUp" && ti > 0) setSelTr(trs[ti - 1].id);
          if (k === "ArrowDown" && ti < trs.length - 1) setSelTr(trs[ti + 1].id);
          if (k === "Enter" || k === " ") chgTr(selTr!);
          if (["Escape", "Backspace"].includes(k)) setTPick(false);
          return;
        }
        const maxPb = trs.length > 1 ? 5 : 4;
        if (["Escape", "Backspace", "XF86Back"].includes(k)) { stopPlay(); return; }
        if (k === "ArrowLeft") setPb(p => Math.max(0, p - 1));
        if (k === "ArrowRight") setPb(p => Math.min(maxPb, p + 1));
        if (k === "Enter" || k === " ") {
          if (pb === 0) stopPlay();
          if (pb === 1 && vRef.current) { vRef.current.currentTime = Math.max(0, vRef.current.currentTime - 15); flash("⏪ −15с"); }
          if (pb === 2 && vRef.current) { vRef.current.paused ? vRef.current.play() : vRef.current.pause(); }
          if (pb === 3 && vRef.current) { vRef.current.currentTime += 15; flash("⏩ +15с"); }
          if (pb === 4) setQPick(true);
          if (pb === 5 && trs.length > 1) setTPick(true);
        }
        return;
      }

      // DETAIL
      if (z === "det") {
        if (["Escape", "Backspace", "XF86Back"].includes(k)) { setDet(null); setZ("rows"); return; }
        if (k === "ArrowLeft") setDb(p => Math.max(0, p - 1));
        if (k === "ArrowRight") setDb(p => Math.min(2, p + 1));
        if (k === "Enter" || k === " ") {
          if (db === 0) startPlay();
          if (db === 1 && det) {
            const added = toggleFavorite({ id: det.id, type: det.type, title: det.title, poster_path: det.poster_path, vote_average: det.rating, addedAt: Date.now() });
            flash(added ? "♥ Добавлено в избранное" : "Удалено из избранного");
          }
          if (db === 2) { setDet(null); setZ("rows"); }
        }
        return;
      }

      // SIDEBAR
      if (z === "sb") {
        if (k === "ArrowUp") setSi(i => Math.max(0, i - 1));
        if (k === "ArrowDown") setSi(i => Math.min(SIDEBAR.length - 1, i + 1));
        if (["ArrowRight", "Escape", "Backspace"].includes(k)) { setSo(false); setZ("hero"); return; }
        if (k === "Enter" || k === " ") {
          if (SIDEBAR[si].id === "home") { setSo(false); setZ("hero"); mRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }
          else { flash(SIDEBAR[si].label); setSo(false); setZ("hero"); }
        }
        return;
      }

      // HERO
      if (z === "hero") {
        if (k === "ArrowLeft") { if (hb > 0) setHb(h => h - 1); else { setSo(true); setZ("sb"); } }
        if (k === "ArrowRight" && hb < 1) setHb(h => h + 1);
        if (k === "ArrowDown") {
          setZ("rows"); setRi(0);
          const c = cMem.current[0] ?? 0; setCi(c); sMain(0); setTimeout(() => sRow(0, c), 80);
        }
        if (k === "Enter" || k === " ") { if (hero) openDet(hero); }
        return;
      }

      // ROWS
      if (z === "rows") {
        const mx = rows[ri]?.items.length - 1 || 0;
        if (k === "ArrowLeft") { if (ci > 0) { const n = ci - 1; setCi(n); sRow(ri, n); } else { setSo(true); setZ("sb"); } }
        if (k === "ArrowRight" && ci < mx) { const n = ci + 1; setCi(n); sRow(ri, n); }
        if (k === "ArrowUp") {
          cMem.current[ri] = ci;
          if (ri > 0) { const nr = ri - 1; const nc = Math.min(cMem.current[nr] ?? 0, rows[nr].items.length - 1); setRi(nr); setCi(nc); sMain(nr); setTimeout(() => sRow(nr, nc), 80); }
          else { setZ("hero"); setHb(0); mRef.current?.scrollTo({ top: 0, behavior: "smooth" }); }
        }
        if (k === "ArrowDown") {
          cMem.current[ri] = ci;
          if (ri < rows.length - 1) { const nr = ri + 1; const nc = Math.min(cMem.current[nr] ?? 0, rows[nr].items.length - 1); setRi(nr); setCi(nc); sMain(nr); setTimeout(() => sRow(nr, nc), 80); }
        }
        if (k === "Enter" || k === " ") { const it = rows[ri]?.items[ci]; if (it) openDet(it); }
        if (["Escape", "Backspace"].includes(k)) { setSo(true); setZ("sb"); }
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [z, hb, ri, ci, si, db, pb, paused, rows, hero, sRow, sMain, flash, openDet, startPlay, stopPlay, det, sd, sq, selTr, trs, chgQ, chgTr, qPick, tPick, play]);

  // ═══════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════

  // Focused button style helper
  const fBtn = (focused: boolean, primary?: boolean) => ({
    transform: focused ? "scale(1.06)" : "scale(1)",
    transition: "all 0.2s cubic-bezier(0.4,0,0.2,1)",
    ...(primary ? {
      background: focused ? "hsl(var(--primary))" : "hsl(var(--primary) / 0.75)",
      color: "#fff",
      boxShadow: focused ? "0 0 28px hsl(var(--primary) / 0.5), 0 0 0 2px hsl(var(--primary) / 0.6)" : "none",
    } : {
      background: focused ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.05)",
      color: focused ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))",
      boxShadow: focused ? "0 0 0 2px hsl(var(--primary) / 0.5)" : "none",
    }),
  });

  return (
    <div className="fixed inset-0 bg-background text-foreground overflow-hidden select-none">

      {/* ═══ SIDEBAR ═══ */}
      <nav className="fixed left-0 top-0 bottom-0 z-[100] flex flex-col pt-4 transition-all duration-300"
        style={{ width: so ? SB_EX : SB_W, background: so ? "rgba(9,9,11,0.98)" : "rgba(9,9,11,0.88)", backdropFilter: "blur(20px)", borderRight: `1px solid rgba(255,255,255,${so ? 0.08 : 0.04})` }}>
        <div className="flex items-center gap-3 mb-2 h-[52px]" style={{ justifyContent: so ? "flex-start" : "center", padding: so ? "0 20px" : 0 }}>
          <div className="w-[34px] h-[34px] rounded-[10px] bg-primary flex items-center justify-center text-[16px] font-black text-white shrink-0">К</div>
          {so && <span className="text-[15px] font-bold whitespace-nowrap">Кинотеатр Егора</span>}
        </div>
        <div className="flex-1 flex flex-col gap-0.5 px-1.5">
          {SIDEBAR.map((it, i) => {
            const f = z === "sb" && si === i;
            return (
              <div key={it.id} className="flex items-center gap-3 rounded-[10px] cursor-pointer transition-all duration-200"
                style={{ padding: so ? "12px 14px" : "12px 0", justifyContent: so ? "flex-start" : "center",
                  background: f ? "hsl(var(--primary) / 0.15)" : "transparent",
                  border: f ? "2px solid hsl(var(--primary) / 0.5)" : "2px solid transparent",
                  color: f ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
                  transform: f ? "scale(1.02)" : "scale(1)" }}>
                <Ic d={it.d} />
                {so && <span className={`text-sm whitespace-nowrap ${f ? "font-semibold" : ""}`}>{it.label}</span>}
              </div>
            );
          })}
        </div>
        {so && <div className="px-5 py-3 text-[11px] text-muted-foreground/50">↑↓ выбор · OK подтвердить · → закрыть</div>}
      </nav>

      {/* ═══ MAIN ═══ */}
      <main ref={mRef} className="h-screen overflow-y-auto overflow-x-hidden transition-[margin-left] duration-300"
        style={{ marginLeft: so ? SB_EX : SB_W }}>

        {/* HERO */}
        {hero && (
          <div className="relative h-[460px] overflow-hidden">
            <div className="absolute inset-0">
              {hero.backdrop_path
                ? <img src={getBackdropUrl(hero.backdrop_path)} alt="" className="w-full h-full object-cover" />
                : <div className="w-full h-full bg-gradient-to-br from-purple-950 via-gray-950 to-background" />}
              <div className="absolute inset-0 bg-gradient-to-r from-background via-background/40 to-background" />
              <div className="absolute bottom-0 inset-x-0 h-[180px] bg-gradient-to-t from-background to-transparent" />
            </div>
            <div className="relative z-[2] h-full flex items-end px-14 pb-11">
              <div className="max-w-[620px]">
                <span className="inline-block px-3 py-1 rounded-lg bg-primary/15 text-primary text-xs font-semibold mb-3 border border-primary/20">Фильм</span>
                <h1 className="text-[44px] font-extrabold leading-[1.1] tracking-tight mb-2.5">{hero.title}</h1>
                <div className="flex gap-3 items-center mb-3 text-sm text-muted-foreground">
                  <span className="text-yellow-400 font-bold">⭐ {hero.rating}</span>
                  <span>{hero.year}</span>
                </div>
                {hero.overview && <p className="text-[15px] leading-relaxed text-muted-foreground mb-6 line-clamp-2 max-w-[500px]">{hero.overview}</p>}
                <div className="flex gap-2.5">
                  {["Смотреть", "Подробнее"].map((lbl, i) => (
                    <button key={i} className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-bold cursor-pointer border-none"
                      style={fBtn(z === "hero" && hb === i, i === 0)}>
                      <span className="text-[13px]">{i === 0 ? "▶" : "ℹ"}</span>{lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ROWS */}
        <div className="pt-4 pb-16">
          {rows.map((row, rowI) => (
            <div key={row.id} className="mb-9">
              <div className="px-14 pb-3.5 text-lg font-bold flex items-center gap-2 transition-colors duration-200"
                style={{ color: z === "rows" && ri === rowI ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>
                <span className="text-[15px]">{row.icon}</span>{row.title}
              </div>
              <div ref={el => { rRefs.current[rowI] = el; }} className="flex gap-3 px-14 py-1 overflow-x-auto" style={{ scrollBehavior: "smooth", scrollbarWidth: "none" }}>
                {row.items.map((it, colI) => {
                  const f = z === "rows" && ri === rowI && ci === colI;
                  return (
                    <div key={`${it.id}-${it.type}-${colI}`} className="shrink-0 transition-all duration-200" style={{ width: 185, transform: f ? "scale(1.08)" : "scale(1)", zIndex: f ? 10 : 1 }}>
                      <div className="w-full aspect-[2/3] rounded-xl bg-card overflow-hidden relative cursor-pointer"
                        style={{ border: f ? "2px solid hsl(var(--primary) / 0.6)" : "2px solid rgba(255,255,255,0.05)", boxShadow: f ? "0 8px 32px hsl(var(--primary) / 0.35)" : "0 2px 8px rgba(0,0,0,0.4)" }}>
                        <img src={getImageUrl(it.poster_path, "w342")} alt={it.title} className="w-full h-full object-cover" loading="lazy"
                          onError={e => { (e.target as HTMLImageElement).src = "/abstract-movie-poster.png"; }} />
                        <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-black/75 backdrop-blur"
                          style={{ color: it.rating >= 7.5 ? "#facc15" : it.rating >= 5 ? "#a1a1aa" : "#ef4444" }}>⭐ {it.rating}</div>
                        {it.isSeries && <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-primary/90 text-[10px] font-bold text-white">Сериал</div>}
                        {it.progress != null && it.progress > 0 && <div className="absolute bottom-0 inset-x-0 h-[3px] bg-black/50"><div className="h-full bg-primary" style={{ width: `${it.progress}%` }} /></div>}
                        {it.season && it.episode && <div className="absolute bottom-2 left-2 bg-primary/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">S{it.season}E{it.episode}</div>}
                        {f && <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_50%_80%,hsl(var(--primary)/0.1)_0%,transparent_60%)]" />}
                      </div>
                      <div className="mt-2 text-[13px] font-semibold truncate transition-colors" style={{ color: f ? "hsl(var(--foreground))" : "hsl(var(--muted-foreground))" }}>{it.title}</div>
                      <div className="text-[11px] text-muted-foreground/60 mt-0.5">{it.year}{it.isSeries ? " · Сериал" : ""}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* ═══ DETAIL ═══ */}
      {det && !play && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/93 backdrop-blur-[40px]" style={{ animation: "tvIn .3s ease-out" }}>
          <div className="max-w-[740px] w-full px-11">
            <div className="flex gap-8 mb-8">
              <div className="w-[200px] h-[300px] rounded-2xl shrink-0 bg-card overflow-hidden shadow-2xl border border-white/[0.08]">
                <img src={getImageUrl(det.poster_path, "w342")} alt={det.title} className="w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).src = "/abstract-movie-poster.png"; }} />
              </div>
              <div className="flex-1">
                <h2 className="text-[34px] font-extrabold leading-[1.15] mb-3">{det.title}</h2>
                <div className="flex gap-3 text-sm text-muted-foreground mb-4 flex-wrap items-center">
                  <span className="text-yellow-400 font-bold">⭐ {det.rating}</span>
                  <span>{det.year}</span>
                  {det.isSeries && <span className="px-2.5 py-0.5 rounded-lg bg-primary/15 text-primary text-xs font-semibold">Сериал</span>}
                </div>
                <p className="text-sm leading-relaxed text-muted-foreground">{det.overview || `Рейтинг ${det.rating}/10 · ${det.year}`}</p>
                {det.progress != null && det.progress > 0 && <p className="text-[13px] text-primary mt-2">Просмотрено {det.progress}%</p>}
              </div>
            </div>
            <div className="flex gap-3">
              {[{ ic: "▶", l: "Смотреть", p: true }, { ic: "♥", l: det ? (isFavorite(det.id, det.type) ? "В избранном ♥" : "В избранное") : "" }, { ic: "←", l: "Назад" }].map((b, i) => (
                <button key={i} className="flex items-center gap-2 px-7 py-3.5 rounded-xl text-[15px] font-bold cursor-pointer border-none"
                  style={fBtn(z === "det" && db === i, b.p)}>{b.ic} {b.l}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ═══ PLAYER ═══ */}
      {play && det && (
        <div className="fixed inset-0 z-[300] bg-black flex flex-col">
          <div className="flex-1 relative">
            <video ref={vRef} className="w-full h-full bg-black" playsInline />
            <div className="absolute top-7 left-9 text-[16px] font-semibold text-white/60 pointer-events-none">
              {det.title}{det.season && det.episode ? ` · S${det.season}E${det.episode}` : ""}
            </div>
            {pLoad && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
                  <p className="text-white font-semibold">Загрузка...</p>
                </div>
              </div>
            )}
            {pErr && !pLoad && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/80">
                <div className="text-center"><p className="text-red-400 text-[16px] mb-4">{pErr}</p>
                  <button onClick={() => fetchStr(det)} className="px-6 py-3 bg-primary rounded-xl text-white font-medium">Попробовать снова</button></div>
              </div>
            )}
            {/* Quality picker */}
            {qPick && sd?.streams && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-20">
                <div className="bg-gray-900/95 border border-white/10 rounded-2xl p-6 min-w-[200px]">
                  <p className="text-white font-bold mb-4 text-center">Качество</p>
                  {Object.keys(sd.streams).map((q: string) => (
                    <div key={q} className="px-4 py-3 rounded-xl mb-1 text-center transition-all duration-200"
                      style={{ background: sq === q ? "hsl(var(--primary) / 0.2)" : "transparent", border: sq === q ? "2px solid hsl(var(--primary) / 0.5)" : "2px solid transparent", color: sq === q ? "hsl(var(--primary))" : "#a1a1aa" }}>{q}</div>
                  ))}
                  <p className="text-[11px] text-muted-foreground/50 text-center mt-3">↑↓ выбор · OK применить · ↩ назад</p>
                </div>
              </div>
            )}
            {/* Translator picker */}
            {tPick && trs.length > 0 && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-20">
                <div className="bg-gray-900/95 border border-white/10 rounded-2xl p-6 min-w-[260px] max-h-[400px] overflow-y-auto">
                  <p className="text-white font-bold mb-4 text-center">Озвучка</p>
                  {trs.map((t: any) => (
                    <div key={t.id} className="px-4 py-3 rounded-xl mb-1 transition-all duration-200"
                      style={{ background: selTr === t.id ? "hsl(var(--primary) / 0.2)" : "transparent", border: selTr === t.id ? "2px solid hsl(var(--primary) / 0.5)" : "2px solid transparent", color: selTr === t.id ? "hsl(var(--primary))" : "#a1a1aa" }}>{t.name}</div>
                  ))}
                  <p className="text-[11px] text-muted-foreground/50 text-center mt-3">↑↓ выбор · OK применить · ↩ назад</p>
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="px-14 pb-7 pt-10 bg-gradient-to-t from-black/95 via-black/80 to-transparent">
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xs text-muted-foreground tabular-nums w-[55px]">{fmtT(pt)}</span>
              <div className="flex-1 h-1 bg-white/10 rounded-sm overflow-hidden">
                <div className="h-full bg-primary rounded-sm transition-[width] duration-500 ease-linear" style={{ width: `${pd > 0 ? (pt / pd) * 100 : 0}%` }} />
              </div>
              <span className="text-xs text-muted-foreground/60 tabular-nums w-[55px] text-right">{fmtT(pd)}</span>
            </div>
            <div className="flex items-center justify-center gap-2">
              {[
                { ic: "✕" }, { ic: "−15" }, { ic: paused ? "▶" : "⏸" }, { ic: "+15" }, { ic: "HD" },
                ...(trs.length > 1 ? [{ ic: "🎙" }] : []),
              ].map((btn, i) => {
                const f = z === "play" && pb === i;
                return (
                  <div key={i} className="rounded-xl cursor-pointer transition-all duration-200"
                    style={{
                      padding: i === 2 ? "12px 24px" : "10px 18px",
                      background: f ? "hsl(var(--primary))" : "rgba(255,255,255,0.06)",
                      border: f ? "2px solid hsl(var(--primary) / 0.7)" : "2px solid transparent",
                      fontSize: i === 2 ? 20 : 14, fontWeight: 700,
                      color: f ? "#fff" : "#a1a1aa",
                      transform: f ? "scale(1.12)" : "scale(1)",
                      boxShadow: f ? "0 0 24px hsl(var(--primary) / 0.35)" : "none",
                    }}>{btn.ic}</div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TOAST */}
      {toast && (
        <div className="fixed bottom-11 left-1/2 -translate-x-1/2 z-[400] px-6 py-3 rounded-xl bg-card/95 backdrop-blur-xl border border-primary/30 text-primary text-sm font-semibold shadow-lg"
          style={{ animation: "tvIn .25s ease-out" }}>{toast}</div>
      )}

      {/* Hints */}
      {!play && !det && (
        <div className="fixed bottom-3.5 right-5 z-[90] flex gap-4 text-[11px] text-muted-foreground/40">
          <span>◀▶▲▼ навигация</span><span>OK выбрать</span><span>↩ назад</span>
        </div>
      )}

      <style>{`
        @keyframes tvIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
      `}</style>
    </div>
  );
}
