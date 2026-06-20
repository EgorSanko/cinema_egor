"use client";

// TikTok-style vertical movie-TRAILER feed (MovieTok, Phase 1, client UI).
// Self-contained: maintains the user's taste vector + seen list in localStorage,
// fetches ranked trailer batches from the stateless /api/feed endpoint, plays the
// in-view trailer via the YouTube IFrame Player API, captures implicit signals per
// impression, folds them into taste client-side, and beacons them to /api/feed/events.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Heart, Bookmark, X, Volume2, VolumeX, Loader2, RotateCw,
} from "lucide-react";
import type {
  FeedTrailer, SignalEvent, TasteVector, FeedRequest, FeedResponse,
} from "@/lib/feed/types";
import { emptyTaste } from "@/lib/feed/types";
import { updateTaste } from "@/lib/feed/features";
import { toggleFavorite, isFavorite, type FavoriteItem } from "@/lib/storage";

const TASTE_KEY = "movietok_taste";
const SEEN_KEY = "movietok_seen";
const SEEN_CAP = 400;
const BATCH = 8;
const PREFETCH_WITHIN = 3; // fetch next batch when this close to the end

// Poster path -> full /tmdb-img url (matches movie-player.tsx convention).
function posterUrl(poster: string | null): string | null {
  if (!poster) return null;
  return `/tmdb-img/w500${poster}`;
}

// ---- localStorage helpers (SSR-safe) -------------------------------------

function loadTaste(): TasteVector | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(TASTE_KEY);
    if (!raw) return null;
    const t = JSON.parse(raw) as TasteVector;
    if (t && typeof t === "object" && t.genres && t.decades) return t;
    return null;
  } catch {
    return null;
  }
}

function saveTaste(t: TasteVector): void {
  try {
    localStorage.setItem(TASTE_KEY, JSON.stringify(t));
  } catch {
    /* quota / private mode — ignore */
  }
}

function loadSeen(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SEEN_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function saveSeen(seen: number[]): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen.slice(-SEEN_CAP)));
  } catch {
    /* ignore */
  }
}

// movieIds the user positively engaged with (liked / tapped «Смотреть» / watched
// a lot). Sent to the server so it can do "похожим зашло" collaborative ranking.
const POSITIVES_KEY = "movietok_positives";
const POSITIVES_CAP = 60;

function loadPositives(): number[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(POSITIVES_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((x): x is number => typeof x === "number") : [];
  } catch {
    return [];
  }
}

function savePositives(ids: number[]): void {
  try {
    localStorage.setItem(POSITIVES_KEY, JSON.stringify(ids.slice(0, POSITIVES_CAP)));
  } catch {
    /* ignore */
  }
}

// ---- YouTube IFrame API loader -------------------------------------------

interface YTPlayer {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  setPlaybackRate: (rate: number) => void;
  destroy: () => void;
}

type YTPlayerState = number;

interface YTNamespace {
  Player: new (
    el: HTMLElement | string,
    opts: {
      videoId: string;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onStateChange?: (e: { target: YTPlayer; data: YTPlayerState }) => void;
        onError?: (e: { target: YTPlayer; data: number }) => void;
      };
    },
  ) => YTPlayer;
  PlayerState: { ENDED: number; PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytReadyPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") return new Promise(() => {});
  if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
  if (ytReadyPromise) return ytReadyPromise;

  ytReadyPromise = new Promise<YTNamespace>((resolve) => {
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      if (window.YT) resolve(window.YT);
    };
    // If a poll detects it became ready some other way, resolve too.
    const poll = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(poll);
        resolve(window.YT);
      }
    }, 200);
    if (!document.getElementById("yt-iframe-api")) {
      const tag = document.createElement("script");
      tag.id = "yt-iframe-api";
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
  });
  return ytReadyPromise;
}

// ---- Per-slide impression tracking ---------------------------------------

interface Tracker {
  activeAt: number;       // ts when this slide became active
  lastPct: number;        // last measured pctWatched 0..1
  liked: boolean;
  saved: boolean;
  notInterested: boolean;
  tapWatch: boolean;
  flushed: boolean;
}

function newTracker(): Tracker {
  return {
    activeAt: 0, lastPct: 0,
    liked: false, saved: false, notInterested: false, tapWatch: false,
    flushed: false,
  };
}

function trailerToFav(t: FeedTrailer): FavoriteItem {
  return {
    id: t.movieId,
    type: "movie",
    title: t.title,
    poster_path: t.poster,
    vote_average: t.voteAverage,
    release_date: t.year ? `${t.year}-01-01` : undefined,
    addedAt: Date.now(),
  };
}

// ==========================================================================

export function TrailerFeed() {
  const [items, setItems] = useState<FeedTrailer[]>([]);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  // Slides whose YouTube trailer won't embed (age-restricted / removed / owner
  // disabled embedding). We show the poster and auto-skip past them.
  const [broken, setBroken] = useState<Set<number>>(() => new Set());
  const brokenRef = useRef<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<(HTMLDivElement | null)[]>([]);
  const playerHosts = useRef<Record<number, HTMLDivElement | null>>({});
  const players = useRef<Record<number, YTPlayer>>({});
  const trackers = useRef<Record<number, Tracker>>({});

  // Mutable mirrors so callbacks/observers read fresh values without re-binding.
  const tasteRef = useRef<TasteVector | null>(null);
  const seenRef = useRef<number[]>([]);
  const positivesRef = useRef<number[]>([]);
  // Short-term session intent (Phase 3): in-memory, fresh each visit, fast LR.
  const sessionRef = useRef<TasteVector | null>(null);
  const itemsRef = useRef<FeedTrailer[]>([]);
  const activeRef = useRef(0);
  const mutedRef = useRef(true);
  const loadingRef = useRef(false);
  const exhaustedRef = useRef(false);

  useEffect(() => { itemsRef.current = items; }, [items]);
  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { mutedRef.current = muted; }, [muted]);
  useEffect(() => { exhaustedRef.current = exhausted; }, [exhausted]);

  // Sound is OFF by default — the user turns it on with the speaker button
  // (auto-unmute on mobile proved unreliable). The choice is remembered, and
  // once ON it's re-applied to every slide as it starts playing.
  useEffect(() => {
    try {
      setMuted(localStorage.getItem("movietok_sound") !== "on");
    } catch { /* noop */ }
  }, []);

  // ---- fetch a batch -----------------------------------------------------

  const fetchBatch = useCallback(async (): Promise<void> => {
    if (loadingRef.current || exhaustedRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(false);
    try {
      const body: FeedRequest = {
        taste: tasteRef.current,
        session: sessionRef.current,
        seen: seenRef.current,
        positives: positivesRef.current,
        n: BATCH,
      };
      const res = await fetch("/api/feed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const data = (await res.json()) as FeedResponse;
      const incoming = Array.isArray(data?.items) ? data.items : [];

      if (incoming.length === 0) {
        setExhausted(true);
        return;
      }

      // De-dupe against everything already in the feed.
      const have = new Set(itemsRef.current.map((i) => i.movieId));
      const fresh = incoming.filter((i) => i && !have.has(i.movieId));
      if (fresh.length === 0) {
        setExhausted(true);
        return;
      }

      const nextSeen = seenRef.current.slice();
      for (const it of fresh) nextSeen.push(it.movieId);
      seenRef.current = nextSeen.slice(-SEEN_CAP);
      saveSeen(seenRef.current);

      setItems((prev) => [...prev, ...fresh]);
    } catch {
      setError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  // ---- initial load ------------------------------------------------------

  useEffect(() => {
    tasteRef.current = loadTaste();
    seenRef.current = loadSeen();
    positivesRef.current = loadPositives();
    void fetchBatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- signal flush ------------------------------------------------------

  const measurePct = useCallback((idx: number): number => {
    const p = players.current[idx];
    if (!p) return trackers.current[idx]?.lastPct ?? 0;
    try {
      const dur = p.getDuration();
      const cur = p.getCurrentTime();
      if (dur > 0) return Math.max(0, Math.min(1, cur / dur));
    } catch {
      /* player not ready */
    }
    return trackers.current[idx]?.lastPct ?? 0;
  }, []);

  const flushSignal = useCallback((idx: number) => {
    const tr = trackers.current[idx];
    const item = itemsRef.current[idx];
    if (!tr || !item || tr.flushed || tr.activeAt === 0) return;
    tr.flushed = true;

    const dwellMs = Date.now() - tr.activeAt;
    const pct = Math.max(tr.lastPct, measurePct(idx));

    const event: SignalEvent = {
      movieId: item.movieId,
      genreIds: item.genreIds,
      decade: item.decade,
      dwellMs,
      pctWatched: pct,
      completed: pct > 0.9,
      fastSkip: dwellMs < 2000,
      tapWatch: tr.tapWatch,
      playedFull: false,
      liked: tr.liked,
      saved: tr.saved,
      notInterested: tr.notInterested,
    };

    // Positive engagement? Remember it for collaborative ("похожим зашло")
    // ranking and tell the server which other titles this user likes.
    const positive =
      event.tapWatch || event.liked || event.saved ||
      (event.completed && event.pctWatched > 0.7);
    const recentPositives = positivesRef.current.filter((id) => id !== item.movieId);
    if (positive) {
      positivesRef.current = [item.movieId, ...recentPositives].slice(0, POSITIVES_CAP);
      savePositives(positivesRef.current);
    }

    // (a) fold into long-term taste (persist) + short-term session intent (memory)
    const next = updateTaste(tasteRef.current, event);
    tasteRef.current = next;
    saveTaste(next);
    sessionRef.current = updateTaste(sessionRef.current, event, 0.45);

    // (b) fire-and-forget to the events endpoint (drives global CF)
    try {
      const payload = JSON.stringify({ ...event, recentPositives });
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon(
          "/api/feed/events",
          new Blob([payload], { type: "application/json" }),
        );
      } else {
        void fetch("/api/feed/events", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {
      /* ignore — endpoint may not exist yet */
    }
  }, [measurePct]);

  // ---- broken-trailer handling ------------------------------------------

  const goNext = useCallback(() => {
    const el = slideRefs.current[activeRef.current + 1];
    if (el) el.scrollIntoView({ behavior: "smooth" });
  }, []);

  // A trailer failed to embed (age-restricted / removed / embedding disabled).
  // Show its poster instead, and if it's the active slide, glide to the next.
  const markBroken = useCallback((i: number) => {
    if (brokenRef.current.has(i)) return;
    const next = new Set(brokenRef.current);
    next.add(i);
    brokenRef.current = next;
    setBroken(next);
    if (i === activeRef.current) setTimeout(goNext, 600);
  }, [goNext]);

  // ---- player lifecycle for the active slide -----------------------------

  // Create (or resume) the player for `idx`, destroy stale ones outside window.
  const syncPlayers = useCallback((idx: number) => {
    // Only the ACTIVE slide gets a player. Each is created FRESH when it
    // becomes active → a fresh muted autoplay (which mobile allows), instead of
    // resuming a paused player (which Samsung blocks). Others show the poster.
    const keep = new Set<number>([idx]);

    // Destroy players outside the keep window to free resources.
    for (const k of Object.keys(players.current)) {
      const ki = Number(k);
      if (!keep.has(ki)) {
        try { players.current[ki]?.destroy(); } catch { /* noop */ }
        delete players.current[ki];
      }
    }

    void loadYouTubeApi().then((YT) => {
      keep.forEach((i) => {
        const item = itemsRef.current[i];
        const host = playerHosts.current[i];
        if (!item || !item.ytKey || !host) return;

        if (!players.current[i]) {
          // host gets an inner div the API replaces with an <iframe>.
          const mount = document.createElement("div");
          mount.style.width = "100%";
          mount.style.height = "100%";
          host.innerHTML = "";
          host.appendChild(mount);
          players.current[i] = new YT.Player(mount, {
            videoId: item.ytKey,
            playerVars: {
              autoplay: 1,
              mute: 1,
              controls: 0,
              modestbranding: 1,
              playsinline: 1,
              rel: 0,
              loop: 1,
              fs: 0,
              iv_load_policy: 3,
            },
            events: {
              onReady: (e) => {
                try { e.target.setPlaybackRate(1.5); } catch { /* noop */ }
                if (i === activeRef.current) {
                  // ALWAYS start muted — mobile blocks unmuted autoplay, which
                  // left the video stuck/paused. We unmute later, once it's
                  // actually PLAYING (onStateChange), which browsers allow.
                  e.target.mute();
                  e.target.playVideo();
                } else {
                  // Only the active slide plays — mobile allows just one video
                  // at a time, so others must pause or the next won't start.
                  e.target.mute();
                  e.target.pauseVideo();
                }
              },
              onStateChange: (e) => {
                const tr = trackers.current[i];
                if (tr) tr.lastPct = measurePct(i);
                // Once the active video is actually PLAYING, unmute it if the
                // user wants sound (allowed now that it's playing).
                if (window.YT && e.data === window.YT.PlayerState.PLAYING) {
                  if (i === activeRef.current && !mutedRef.current) {
                    try { e.target.unMute(); } catch { /* noop */ }
                  }
                }
                if (window.YT && e.data === window.YT.PlayerState.ENDED) {
                  if (tr) tr.lastPct = 1;
                  try { e.target.playVideo(); } catch { /* loop restart */ }
                }
              },
              // 101/150 = embedding disabled (often age-restricted), 100 = gone.
              onError: () => { markBroken(i); },
            },
          });
        } else if (i === activeRef.current) {
          const p = players.current[i];
          try {
            p.setPlaybackRate(1.5);
            p.mute();           // start muted; onStateChange unmutes once playing
            p.playVideo();
          } catch { /* noop */ }
        } else {
          // pause non-active (one-video-at-a-time on mobile)
          try { players.current[i]?.pauseVideo(); } catch { /* noop */ }
        }
      });
    });
  }, [measurePct, markBroken]);

  // React to the active slide changing.
  useEffect(() => {
    if (items.length === 0) return;

    // ensure a tracker exists and mark active time
    if (!trackers.current[active]) trackers.current[active] = newTracker();
    const tr = trackers.current[active];
    if (tr.activeAt === 0 || tr.flushed) {
      tr.activeAt = Date.now();
      tr.flushed = false;
    }

    syncPlayers(active);

    // Robustly (re)start the active video — the player may not be ready the
    // instant the slide becomes active, so retry a few times. This is what
    // fixes "the next trailer doesn't auto-play after a swipe".
    const tryPlay = () => {
      const p = players.current[activeRef.current];
      if (p) { try { p.mute(); p.playVideo(); } catch { /* not ready */ } }
    };
    tryPlay();
    const r1 = setTimeout(tryPlay, 250);
    const r2 = setTimeout(tryPlay, 700);
    const r3 = setTimeout(tryPlay, 1400);

    // sample watch progress while active
    const sampler = setInterval(() => {
      const t = trackers.current[activeRef.current];
      if (t) t.lastPct = Math.max(t.lastPct, measurePct(activeRef.current));
    }, 1000);

    return () => {
      clearInterval(sampler);
      clearTimeout(r1); clearTimeout(r2); clearTimeout(r3);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items.length]);

  // ---- IntersectionObserver: which slide is in view ----------------------

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || items.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
            const idxStr = (entry.target as HTMLElement).dataset.idx;
            if (idxStr == null) continue;
            const idx = Number(idxStr);
            if (idx === activeRef.current) continue;

            // Leaving the previous slide -> flush its signal.
            flushSignal(activeRef.current);

            setActive(idx);

            // Infinite scroll: prefetch when near the end.
            if (idx >= itemsRef.current.length - PREFETCH_WITHIN) {
              void fetchBatch();
            }
          }
        }
      },
      { root, threshold: [0.6] },
    );

    slideRefs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, flushSignal, fetchBatch]);

  // ---- flush on unmount / tab hide ---------------------------------------

  useEffect(() => {
    const onHide = () => flushSignal(activeRef.current);
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") onHide();
    });
    return () => {
      window.removeEventListener("pagehide", onHide);
      flushSignal(activeRef.current);
      for (const k of Object.keys(players.current)) {
        try { players.current[Number(k)]?.destroy(); } catch { /* noop */ }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flushSignal]);

  // ---- actions -----------------------------------------------------------

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      const p = players.current[activeRef.current];
      try { if (next) p?.mute(); else p?.unMute(); } catch { /* noop */ }
      try { localStorage.setItem("movietok_sound", next ? "off" : "on"); } catch { /* noop */ }
      return next;
    });
  }, []);

  const onLike = useCallback((idx: number, item: FeedTrailer) => {
    const result = toggleFavorite(trailerToFav(item));
    const tr = (trackers.current[idx] ??= newTracker());
    tr.liked = result;
    window.dispatchEvent(new CustomEvent("favorites-changed"));
    setItems((p) => [...p]); // re-render to reflect heart state
  }, []);

  const onSave = useCallback((idx: number) => {
    const tr = (trackers.current[idx] ??= newTracker());
    tr.saved = !tr.saved;
    setItems((p) => [...p]);
  }, []);

  const onNotInterested = useCallback((idx: number) => {
    const tr = (trackers.current[idx] ??= newTracker());
    tr.notInterested = true;
    // Scroll to the next slide.
    const next = slideRefs.current[idx + 1];
    next?.scrollIntoView({ behavior: "smooth" });
    setItems((p) => [...p]);
  }, []);

  const onTapWatch = useCallback((idx: number) => {
    const tr = (trackers.current[idx] ??= newTracker());
    tr.tapWatch = true;
    // The <Link> handles navigation; flush so the gold signal is recorded.
    flushSignal(idx);
  }, [flushSignal]);

  // ---- render ------------------------------------------------------------

  // First-load empty state.
  if (items.length === 0) {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center px-6">
        {error ? (
          <div className="text-center space-y-4">
            <p className="text-foreground/80 text-[15px]">Не удалось загрузить ленту</p>
            <button
              onClick={() => fetchBatch()}
              className="inline-flex items-center gap-2 h-11 px-6 rounded-full bg-white text-black text-[13px] font-bold hover:bg-white/90 transition-colors"
            >
              <RotateCw size={16} /> Повторить
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 text-foreground/60">
            <Loader2 size={28} className="animate-spin" />
            <span className="text-[13px]">Подбираем трейлеры…</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black">
      {/* 9:16 column, centered on desktop, full-bleed on mobile */}
      <div
        ref={scrollRef}
        className="mx-auto max-w-[500px] h-[100dvh] overflow-y-scroll snap-y snap-mandatory bg-black no-scrollbar"
        style={{ scrollbarWidth: "none" }}
      >
        {items.map((item, idx) => {
          const liked = isFavorite(item.movieId, "movie");
          const tr = trackers.current[idx];
          const saved = tr?.saved ?? false;
          return (
            <section
              key={`${item.movieId}-${idx}`}
              ref={(el) => { slideRefs.current[idx] = el; }}
              data-idx={idx}
              className="relative flex h-[100dvh] w-full snap-start snap-always flex-col justify-center overflow-hidden bg-black"
            >
              {/* 16:9 trailer band, vertically centred (sits lower than the top). */}
              <div className="relative w-full shrink-0 aspect-video bg-black">
                {/* Poster always behind the video — shown for non-active slides
                    and while the active player loads, so a swipe never reveals a
                    black frame or the previous slide's YouTube overlay. */}
                {posterUrl(item.poster) && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterUrl(item.poster) as string}
                    alt={item.title}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                )}
                {/* Trailer iframe — ONLY the active slide, created fresh. */}
                {idx === active && item.ytKey && !broken.has(idx) && (
                  <div
                    ref={(el) => { playerHosts.current[idx] = el; }}
                    className="yt-frame"
                    aria-hidden
                  />
                )}
                {broken.has(idx) && (
                  <div className="pointer-events-none absolute inset-0 z-[6] flex items-center justify-center">
                    <span className="rounded-full bg-black/55 px-4 py-2 text-[12px] text-white/85 backdrop-blur-sm">
                      Трейлер недоступен
                    </span>
                  </div>
                )}
              </div>

              {/* Poster on the LEFT, title on the RIGHT, just under the video. */}
              <div className="px-4 pt-6">
                <div className="flex items-center gap-4">
                  {posterUrl(item.poster) && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/tmdb-img/w342${item.poster}`}
                      alt={item.title}
                      className="w-24 aspect-[2/3] flex-shrink-0 rounded-xl object-cover ring-1 ring-white/15 shadow-xl shadow-black/50"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                      <span className="text-foreground/80">{item.year}</span>
                      {item.voteAverage > 0 && (
                        <>
                          <span className="text-foreground/30">·</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-300">
                            ★ {item.voteAverage.toFixed(1)}
                          </span>
                        </>
                      )}
                    </div>
                    <h2 className="text-2xl font-black leading-tight tracking-tight text-foreground line-clamp-3">
                      {item.title}
                    </h2>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-6 flex w-full items-center gap-2.5">
                  <Link
                    href={`/movie/${item.movieId}`}
                    onClick={() => onTapWatch(idx)}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-white text-[15px] font-bold text-black shadow-lg shadow-black/40 transition-colors hover:bg-white/90"
                  >
                    <Play size={19} fill="currentColor" /> Смотреть
                  </Link>
                  <button onClick={() => onLike(idx, item)} aria-label="Нравится" className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
                    <Heart size={23} className={liked ? "text-red-500" : "text-white"} fill={liked ? "currentColor" : "none"} />
                  </button>
                  <button onClick={() => onSave(idx)} aria-label="Сохранить" className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
                    <Bookmark size={21} className={saved ? "text-primary" : "text-white"} fill={saved ? "currentColor" : "none"} />
                  </button>
                  <button onClick={() => onNotInterested(idx)} aria-label="Не интересно" className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
                    <X size={23} className="text-white" />
                  </button>
                  <button onClick={toggleMute} aria-label={muted ? "Включить звук" : "Выключить звук"} className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/10 active:bg-white/20">
                    {muted ? <VolumeX size={21} className="text-white" /> : <Volume2 size={21} className="text-white" />}
                  </button>
                </div>
              </div>
            </section>
          );
        })}

        {/* Tail loader / exhausted notice */}
        <div className="flex h-16 items-center justify-center text-foreground/40">
          {loading && <Loader2 size={20} className="animate-spin" />}
          {exhausted && !loading && (
            <span className="text-[12px]">Это все трейлеры на сейчас</span>
          )}
        </div>
      </div>

      <style jsx global>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; }
        /* 16:9 trailer, slightly overscanned + centered so YouTube's own title
           bar (top) and control strip (bottom) are cropped off the band. */
        .yt-frame { position: absolute; inset: 0; overflow: hidden; }
        .yt-frame > iframe,
        .yt-frame > div {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          width: 138%;
          height: 138%;
          border: 0;
          pointer-events: none;
        }
      `}</style>
    </div>
  );
}
