"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Hls from "hls.js";
import { hlsProxyUrl } from "@/lib/quality-probe";
import { pickDefaultQuality, setQualityPref } from "@/lib/quality";
import {
  savePosition,
  getPosition,
  addToHistory,
  saveLastTranslator,
  getLastTranslator,
  saveLastEpisode,
  getLastEpisode,
} from "@/lib/storage";
import { getTvUser } from "@/lib/tv-auth";

// ════════════════════════════════════════════════════════════════
// TV WATCH + PLAYER — fully Android-TV-remote (D-pad) controllable.
//
// Loaded inside the Android TV WebView at /tv-watch/{type}/{id}. No site
// navbar/chrome. Reuses the EXACT resolve machinery the site player uses
// (the /hdrezka/api/search resolve endpoint, hlsProxyUrl wrapping,
// pickDefaultQuality, storage resume) — none of it is reinvented.
//
// Remote keys are handled via BOTH e.key and legacy e.keyCode, because real
// Android TV remotes emit numeric keyCodes (37/38/39/40 arrows, 13 Enter,
// 179/85 play-pause, 8/27 back) and some browsers report key === "" there.
// ════════════════════════════════════════════════════════════════

export type TvWatchSeason = { season_number: number; episode_count: number; name: string };

export type TvWatchMedia = {
  id: number;
  type: "movie" | "tv";
  title: string;        // localized (ru) title — primary search term
  originalTitle: string; // english/original — fallback search term
  year: string;
  poster: string | null;
  posterPath: string | null; // raw TMDB path — for history (not the proxied URL)
  backdrop: string | null;
  overview: string;
  seasons: TvWatchSeason[]; // empty for movies
};

type Translator = { id: number; name: string; is_premium?: boolean };
type ResolveData = {
  stream?: string;
  streams?: Record<string, string>;
  quality?: string;
  translators?: Translator[];
  active_translator_id?: number;
  results?: unknown[];
};

type Episode = { episode_number: number; name: string; still_path: string | null; air_date: string };

// Which screen currently owns the D-pad. The in-player overlay is a SEPARATE
// state machine (`overlay` below) so that the player can be in "none" /
// "controls" / "settings" independently.
type Zone = "picker" | "loading" | "player";
// In-player overlay state machine.
type Overlay = "none" | "controls" | "settings";

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

// Lime focus ring matching /tv-home.
const ringStyle = (focused: boolean, primary?: boolean): React.CSSProperties => ({
  transition: "transform .15s ease-out, box-shadow .15s ease-out, background .15s ease-out",
  transform: focused ? "scale(1.06)" : "scale(1)",
  background: primary
    ? focused ? "var(--primary)" : "color-mix(in srgb, var(--primary) 75%, transparent)"
    : focused ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
  color: primary ? "#0a0a0a" : focused ? "#fff" : "#a1a1aa",
  boxShadow: focused
    ? "0 0 0 4px var(--primary), 0 8px 30px rgba(0,0,0,0.5)"
    : "none",
  outline: "none",
});

export function TvWatch({ media }: { media: TvWatchMedia }) {
  const router = useRouter();

  // ── Auth gate ── an unauthenticated user can't watch. Read the logged-in
  // user the SAME way auth-context does (localStorage "user" = {email,name}).
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    if (getTvUser()) setAuthed(true);
    else router.replace("/tv-login");
  }, [router]);

  // ── Resolve / stream state ──
  const [data, setData] = useState<ResolveData | null>(null);
  const [quality, setQuality] = useState<string>("");
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [translatorId, setTranslatorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ── Series picker state ──
  const validSeasons = media.seasons.filter((s) => s.season_number > 0);
  const isSeries = media.type === "tv" && validSeasons.length > 0;
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  // picker focus: column 0 = season list, column 1 = episode list
  const [pickerCol, setPickerCol] = useState<0 | 1>(0);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [episodeIdx, setEpisodeIdx] = useState(0);

  // ── Playback / overlay state ──
  const [zone, setZone] = useState<Zone>(isSeries ? "picker" : "loading");
  // The in-player overlay state machine: none → controls → settings.
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [playing, setPlaying] = useState(true);
  const [pt, setPt] = useState(0);
  const [pd, setPd] = useState(0);
  // Controls row: 0 ⏪ rewind, 1 ⏯ play/pause, 2 ⏩ forward, 3 ⚙ settings, 4 ✕ exit.
  const [ctrlIdx, setCtrlIdx] = useState(1); // default focus on Play/Pause
  const [settingsTab, setSettingsTab] = useState<0 | 1 | 2>(0); // 0 quality 1 dub 2 episodes
  const [settingsIdx, setSettingsIdx] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInt = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekOnNext = useRef<number | undefined>(undefined); // preserve pos across source switch

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // Restore last-watched season/episode + remembered dub on mount.
  useEffect(() => {
    if (isSeries) {
      const last = getLastEpisode(media.id);
      if (last) {
        setSeason(last.season);
        setEpisode(last.episode);
        const sIdx = validSeasons.findIndex((s) => s.season_number === last.season);
        if (sIdx >= 0) setSeasonIdx(sIdx);
      } else if (validSeasons[0]) {
        setSeason(validSeasons[0].season_number);
      }
    }
    const lt = getLastTranslator(media.id, media.type);
    if (lt) setTranslatorId(lt.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ════════════════════════════════════════════════════════════════
  // RESOLVE — reuse the site player's exact endpoint + fallback chain.
  // ════════════════════════════════════════════════════════════════
  const resolve = useCallback(
    async (opts?: { trId?: number | null; s?: number; e?: number; preservePos?: boolean }) => {
      const trId = opts?.trId ?? translatorId ?? getLastTranslator(media.id, media.type)?.id ?? null;
      const s = opts?.s ?? season;
      const e = opts?.e ?? episode;
      setError("");
      setLoading(true);
      const pos = opts?.preservePos ? videoRef.current?.currentTime || 0 : 0;
      if (pos > 1) seekOnNext.current = pos;

      const year = media.year || "";
      const ruTitle = (media.title || "").replace(/["«»“”]/g, "").trim();
      const origTitle = (media.originalTitle || "").replace(/["«»“”]/g, "").trim();
      const searchTitle = ruTitle || origTitle;
      const trParam = trId ? `&translator_id=${trId}` : "";
      const seriesParam = media.type === "tv" ? `&season=${s}&episode=${e}` : "";

      const build = (title: string, index?: number) =>
        `/hdrezka/api/search?q=${encodeURIComponent(title)}&year=${year}&type=${media.type}` +
        (index != null ? `&index=${index}` : "") +
        seriesParam +
        trParam;

      try {
        let d: ResolveData | null = null;
        const r = await fetch(build(searchTitle));
        d = await r.json();

        // Primary search returned a disambiguation list — try first few hits.
        if ((!d || !d.stream) && d?.results && d.results.length > 0) {
          for (let i = 0; i < Math.min(d.results.length, 5); i++) {
            const r2 = await fetch(build(searchTitle, i));
            const d2: ResolveData = await r2.json();
            if (d2.stream) { d = d2; break; }
          }
        }

        // Russian title found nothing — retry with the original title.
        if ((!d || !d.stream) && origTitle && origTitle !== ruTitle) {
          const ra = await fetch(build(origTitle));
          const da: ResolveData = await ra.json();
          if (da.stream) d = da;
        }

        if (d?.stream) {
          applyStream(d, trId);
          return true;
        }
        setError("Контент пока недоступен в этой озвучке");
        return false;
      } catch {
        setError("Сервер не отвечает");
        return false;
      } finally {
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translatorId, season, episode, media]
  );

  // Pick the smart default quality (connection-aware + remembered choice) and
  // wrap the chosen tier through the LeadSeek HLS proxy — same as the site.
  const applyStream = (d: ResolveData, requestedTr: number | null) => {
    const sq = pickDefaultQuality(d.streams || {}, d.quality || "");
    const url = sq && d.streams?.[sq] ? hlsProxyUrl(d.streams[sq]) : d.stream;
    setData({ ...d, stream: url, quality: sq || d.quality });
    setQuality(sq || d.quality || "");
    if (d.translators?.length) {
      setTranslators(d.translators);
      setTranslatorId((prev) => prev ?? requestedTr ?? d.active_translator_id ?? d.translators![0].id);
    }
  };

  // Auto-resolve a movie immediately on mount (few clicks → straight to player).
  useEffect(() => {
    if (!isSeries) {
      setZone("loading");
      resolve().then((ok) => { if (ok) setZone("player"); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load episode list whenever a season is focused/selected (series). ──
  useEffect(() => {
    if (!isSeries) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tv-episodes?id=${media.id}&season=${season}`);
        const eps: Episode[] = await res.json();
        if (alive) setEpisodes(Array.isArray(eps) ? eps : []);
      } catch {
        if (alive) setEpisodes([]);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, isSeries]);

  // ════════════════════════════════════════════════════════════════
  // HLS load — direct hls.js wrapper (no site chrome). Resumes to seekOnNext
  // (source switch) or saved position.
  // ════════════════════════════════════════════════════════════════
  useEffect(() => {
    const url = data?.stream;
    const v = videoRef.current;
    if (!url || !v) return;

    const seekTarget = (() => {
      if (seekOnNext.current && seekOnNext.current > 1) return seekOnNext.current;
      const sp = getPosition(media.id, media.type, isSeries ? season : undefined, isSeries ? episode : undefined);
      return sp && sp.time > 10 ? sp.time : 0;
    })();
    seekOnNext.current = undefined;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const attachSeek = () => { if (seekTarget > 0) { try { v.currentTime = seekTarget; } catch {} } };

    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { attachSeek(); v.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setError("Ошибка воспроизведения");
      });
    } else {
      v.src = url;
      v.onloadedmetadata = () => { attachSeek(); v.play().catch(() => {}); };
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.stream]);

  // Video element events → progress/paused state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => { setPt(v.currentTime); setPd(v.duration || 0); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [data?.stream]);

  // Periodic position save (drives resume + the site's continue-watching sync).
  useEffect(() => {
    if (!data?.stream) return;
    saveInt.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.duration) return;
      savePosition(media.id, media.type, v.currentTime, v.duration, isSeries ? season : undefined, isSeries ? episode : undefined);
      addToHistory({
        id: media.id,
        type: media.type,
        title: media.title,
        poster_path: media.posterPath,
        vote_average: 0,
        watchedAt: Date.now(),
        progress: v.currentTime,
        duration: v.duration,
        quality,
        season: isSeries ? season : undefined,
        episode: isSeries ? episode : undefined,
      });
    }, 5000);
    return () => { if (saveInt.current) clearInterval(saveInt.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.stream, season, episode, quality]);

  const saveNow = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) {
      savePosition(media.id, media.type, v.currentTime, v.duration, isSeries ? season : undefined, isSeries ? episode : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, episode, isSeries, media]);

  // ── Controls auto-hide ──
  // Show the controls bar and (re)arm the ~5s auto-hide timer. Never auto-hides
  // while the settings panel is open.
  const revealControls = useCallback(() => {
    setOverlay("controls");
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay((o) => (o === "controls" ? "none" : o));
    }, 5000);
  }, []);

  // Reset the auto-hide timer on every handled key press (no-op while settings
  // is open — settings must stay until Back).
  const bumpHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay((o) => (o === "controls" ? "none" : o));
    }, 5000);
  }, []);

  // Briefly flash the controls bar on a blind seek, then let it auto-hide.
  const flashControls = useCallback(() => {
    setOverlay("controls");
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay((o) => (o === "controls" ? "none" : o));
    }, 1800);
  }, []);

  // Clear any pending auto-hide (used when entering settings).
  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  // ════════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════════
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
  }, []);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 1e9), v.currentTime + delta));
    flash(delta > 0 ? "⏩ +10с" : "⏪ −10с");
  }, [flash]);

  // Quality switch — preserve position via seekOnNext, switch proxied source.
  const changeQuality = useCallback((q: string) => {
    if (!data?.streams?.[q] || q === quality) return;
    setQualityPref(q);
    seekOnNext.current = videoRef.current?.currentTime || 0;
    setQuality(q);
    setData((prev) => (prev ? { ...prev, stream: hlsProxyUrl(data.streams![q]), quality: q } : prev));
    flash(`Качество: ${q}`);
  }, [data, quality, flash]);

  // Dub switch — re-resolve with translator_id, preserve position.
  const changeTranslator = useCallback(async (tid: number) => {
    if (tid === translatorId) return;
    const name = translators.find((t) => t.id === tid)?.name || "";
    setTranslatorId(tid);
    saveLastTranslator(media.id, media.type, tid, name);
    flash(`Озвучка: ${name}`);
    await resolve({ trId: tid, preservePos: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translatorId, translators, media, resolve, flash]);

  // Play a series episode: remember it, resolve, enter the player.
  const playEpisode = useCallback(async (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    saveLastEpisode(media.id, s, e);
    setOverlay("none");
    setZone("loading");
    const ok = await resolve({ s, e });
    setZone(ok ? "player" : "picker");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolve, media]);

  // Exit: back to /tv-home (or, for a series in the player, back to the picker).
  const exit = useCallback(() => {
    saveNow();
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setOverlay("none");
    if (isSeries) {
      setData(null);
      setZone("picker");
    } else {
      router.push("/tv-home");
    }
  }, [isSeries, router, saveNow]);

  // ════════════════════════════════════════════════════════════════
  // REMOTE / KEYBOARD — e.key AND legacy e.keyCode.
  // ════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      const c = e.keyCode;
      if (["F5", "F11", "F12"].includes(k)) return;

      const isLeft = k === "ArrowLeft" || c === 37;
      const isUp = k === "ArrowUp" || c === 38;
      const isRight = k === "ArrowRight" || c === 39;
      const isDown = k === "ArrowDown" || c === 40;
      const isEnter = k === "Enter" || c === 13;
      const isSpace = k === " " || k === "Spacebar" || c === 32;
      const isPlayPause = c === 179 || c === 85 || k === "MediaPlayPause";
      const isBack = k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack" || c === 27 || c === 8 || c === 461 || c === 10009;

      if (!isLeft && !isUp && !isRight && !isDown && !isEnter && !isSpace && !isPlayPause && !isBack) return;
      e.preventDefault();

      // ────────── SERIES PICKER ──────────
      if (zone === "picker") {
        if (isBack) { router.push("/tv-home"); return; }
        if (pickerCol === 0) {
          // Season column
          if (isUp) setSeasonIdx((i) => Math.max(0, i - 1));
          else if (isDown) setSeasonIdx((i) => Math.min(validSeasons.length - 1, i + 1));
          else if (isRight) { setPickerCol(1); setEpisodeIdx(0); }
          else if (isEnter || isSpace) {
            const sn = validSeasons[seasonIdx]?.season_number;
            if (sn != null) { setSeason(sn); setPickerCol(1); setEpisodeIdx(0); }
          }
        } else {
          // Episode column
          if (isLeft) setPickerCol(0);
          else if (isUp) setEpisodeIdx((i) => Math.max(0, i - 1));
          else if (isDown) setEpisodeIdx((i) => Math.min(Math.max(0, episodes.length - 1), i + 1));
          else if (isEnter || isSpace || isPlayPause) {
            const ep = episodes[episodeIdx];
            if (ep) playEpisode(season, ep.episode_number);
          }
        }
        return;
      }

      // ────────── LOADING ──────────
      if (zone === "loading") {
        if (isBack) exit();
        return;
      }

      // From here on we are in the PLAYER (zone === "player"). The overlay
      // state machine (none / controls / settings) owns the D-pad.

      // ════════ overlay === "settings" ════════
      // Panel with tabs Качество / Озвучка / Серии and a scrollable list.
      if (overlay === "settings") {
        const tabs: Array<0 | 1 | 2> = isSeries ? [0, 1, 2] : [0, 1];
        const list =
          settingsTab === 0 ? (data?.streams ? Object.keys(data.streams) : [])
          : settingsTab === 1 ? translators.map((t) => t.name)
          : episodes.map((ep) => `${ep.episode_number}`);

        // Back → close settings → controls (NOT exit the player).
        if (isBack) { setOverlay("controls"); revealControls(); return; }
        // ◀▶ switch the active tab.
        if (isLeft) {
          const ti = tabs.indexOf(settingsTab);
          if (ti > 0) { setSettingsTab(tabs[ti - 1]); setSettingsIdx(0); }
        } else if (isRight) {
          const ti = tabs.indexOf(settingsTab);
          if (ti < tabs.length - 1) { setSettingsTab(tabs[ti + 1]); setSettingsIdx(0); }
        // ▲▼ move focus within the active list.
        } else if (isUp) {
          setSettingsIdx((i) => Math.max(0, i - 1));
        } else if (isDown) {
          setSettingsIdx((i) => Math.min(Math.max(0, list.length - 1), i + 1));
        // OK → select the focused item; KEEP settings open afterwards.
        } else if (isEnter || isSpace || isPlayPause) {
          const qualities = data?.streams ? Object.keys(data.streams) : [];
          if (settingsTab === 0 && qualities[settingsIdx]) changeQuality(qualities[settingsIdx]);
          else if (settingsTab === 1 && translators[settingsIdx]) changeTranslator(translators[settingsIdx].id);
          else if (settingsTab === 2 && episodes[settingsIdx]) playEpisode(season, episodes[settingsIdx].episode_number);
        }
        return;
      }

      // ════════ overlay === "controls" ════════
      // Horizontal focusable row: ⏪ rewind, ⏯ play/pause, ⏩ forward, ⚙ settings, ✕ exit.
      const CTRL_COUNT = 5;
      if (overlay === "controls") {
        // Back OR ▼ → hide controls.
        if (isBack || isDown) { clearHideTimer(); setOverlay("none"); return; }
        // ◀▶ → move focus between buttons.
        if (isLeft) { setCtrlIdx((i) => Math.max(0, i - 1)); bumpHideTimer(); return; }
        if (isRight) { setCtrlIdx((i) => Math.min(CTRL_COUNT - 1, i + 1)); bumpHideTimer(); return; }
        // ▲ → just keep controls visible (must NOT open settings).
        if (isUp) { bumpHideTimer(); return; }
        // OK → ACTIVATE the focused button. Settings open ONLY here, on ⚙.
        if (isEnter || isSpace || isPlayPause) {
          if (ctrlIdx === 0) { seek(-10); bumpHideTimer(); }
          else if (ctrlIdx === 1) { togglePlay(); bumpHideTimer(); }
          else if (ctrlIdx === 2) { seek(10); bumpHideTimer(); }
          else if (ctrlIdx === 3) { clearHideTimer(); setSettingsTab(0); setSettingsIdx(0); setOverlay("settings"); }
          else if (ctrlIdx === 4) { exit(); }
          return;
        }
        return;
      }

      // ════════ overlay === "none" (just playing) ════════
      // Back → exit the player (router back / picker for a series).
      if (isBack) { exit(); return; }
      // ▲ or ▼ → reveal the controls bar, focus Play/Pause. MUST NOT open settings.
      if (isUp || isDown) { setCtrlIdx(1); revealControls(); return; }
      // OK / Space / MediaPlayPause → toggle play/pause.
      if (isEnter || isSpace || isPlayPause) { togglePlay(); return; }
      // ◀▶ → blind seek −10s / +10s and briefly flash the controls bar.
      if (isLeft) { seek(-10); flashControls(); return; }
      if (isRight) { seek(10); flashControls(); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    zone, overlay, pickerCol, seasonIdx, episodeIdx, validSeasons, episodes, season, episode,
    isSeries, data, translators, translatorId, settingsTab, settingsIdx, ctrlIdx,
    router, exit, resolve, playEpisode, changeQuality, changeTranslator, seek,
    togglePlay, revealControls, bumpHideTimer, flashControls, clearHideTimer,
  ]);

  const qualities = data?.streams ? Object.keys(data.streams) : [];

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  // Hold the player blank until the auth gate resolves (redirecting otherwise).
  if (!authed) {
    return <div className="fixed inset-0" style={{ background: "#000" }} />;
  }

  return (
    <div className="fixed inset-0 bg-black text-foreground select-none overflow-hidden" style={{ background: "#000" }}>
      {/* ───────── SERIES PICKER ───────── */}
      {zone === "picker" && isSeries && (
        <div className="absolute inset-0 flex flex-col" style={{ background: "var(--background)" }}>
          <header className="px-12 pt-9 pb-5">
            <h1 className="text-4xl font-extrabold tracking-tight">{media.title}</h1>
            <p className="mt-2 text-lg text-muted-foreground">{media.year} · Сериал · Выберите серию</p>
          </header>
          <div className="flex flex-1 gap-8 px-12 pb-10 overflow-hidden">
            {/* Seasons */}
            <div className="w-[260px] shrink-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Сезоны</p>
              <div className="flex flex-col gap-2">
                {validSeasons.map((s, i) => {
                  const f = pickerCol === 0 && seasonIdx === i;
                  const active = s.season_number === season;
                  return (
                    <button
                      key={s.season_number}
                      onClick={() => { setSeason(s.season_number); setSeasonIdx(i); setPickerCol(1); setEpisodeIdx(0); }}
                      className="rounded-xl px-5 py-4 text-left text-lg font-semibold"
                      style={{
                        ...ringStyle(f),
                        background: f ? "var(--primary)" : active ? "color-mix(in srgb, var(--primary) 18%, transparent)" : "rgba(255,255,255,0.05)",
                        color: f ? "#0a0a0a" : active ? "var(--primary)" : "#d4d4d8",
                      }}
                    >
                      {s.name || `Сезон ${s.season_number}`}
                      <span className="ml-2 text-sm opacity-70">{s.episode_count} сер.</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Episodes */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Серии · Сезон {season}</p>
              {episodes.length === 0 ? (
                <p className="text-muted-foreground">Загрузка серий…</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {episodes.map((ep, i) => {
                    const f = pickerCol === 1 && episodeIdx === i;
                    return (
                      <button
                        key={ep.episode_number}
                        onClick={() => playEpisode(season, ep.episode_number)}
                        ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                        className="flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                        style={ringStyle(f)}
                      >
                        <span className="text-xl font-bold tabular-nums" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>
                          {ep.episode_number}
                        </span>
                        <span className="truncate text-base font-medium">{ep.name || `Серия ${ep.episode_number}`}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="px-12 pb-5 text-sm text-muted-foreground/60">◀▶ колонка · ▲▼ выбор · OK смотреть · ↩ назад</div>
        </div>
      )}

      {/* ───────── LOADING ───────── */}
      {zone === "loading" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5" style={{ background: "var(--background)" }}>
          <div className="h-16 w-16 rounded-full border-4 border-white/15" style={{ borderTopColor: "var(--primary)", animation: "tvspin 0.8s linear infinite" }} />
          <p className="text-xl font-semibold">Загрузка…</p>
          <p className="text-base text-muted-foreground">{media.title}{isSeries ? ` · S${season}E${episode}` : ""}</p>
        </div>
      )}

      {/* ───────── PLAYER ───────── */}
      {zone === "player" && (
        <>
          <video ref={videoRef} className="absolute inset-0 h-full w-full bg-black" playsInline autoPlay />

          {/* Title chip — shown whenever an overlay is up. */}
          {overlay !== "none" && (
            <div className="pointer-events-none absolute z-10 text-lg font-semibold text-white/70" style={{ left: "4vw", top: "4vh" }}>
              {media.title}{isSeries ? ` · S${season}E${episode}` : ""}
            </div>
          )}

          {/* Inline loading (dub/quality re-resolve) */}
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
              <div className="h-14 w-14 rounded-full border-4 border-white/15" style={{ borderTopColor: "var(--primary)", animation: "tvspin 0.8s linear infinite" }} />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80">
              <p className="text-lg text-red-400">{error}</p>
              <button
                onClick={() => resolve().then((ok) => ok && setZone("player"))}
                className="rounded-xl px-6 py-3 font-semibold"
                style={ringStyle(true, true)}
              >
                Попробовать снова
              </button>
            </div>
          )}

          {/* ── CONTROLS BAR ── overscan-safe (pad ~4vh/4vw, not flush). */}
          {overlay === "controls" && (
            <div
              className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-16"
              style={{ paddingLeft: "4vw", paddingRight: "4vw", paddingBottom: "4vh" }}
            >
              <div className="mb-5 flex items-center gap-4">
                <span className="w-[68px] text-right tabular-nums text-sm text-muted-foreground">{fmt(pt)}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/15">
                  <div className="h-full rounded-full" style={{ width: `${pd > 0 ? (pt / pd) * 100 : 0}%`, background: "var(--primary)" }} />
                </div>
                <span className="w-[68px] tabular-nums text-sm text-muted-foreground/70">{fmt(pd)}</span>
              </div>
              <div className="flex items-center justify-center gap-3">
                {/* Order MUST match the key handler: 0 ⏪ 1 ⏯ 2 ⏩ 3 ⚙ 4 ✕ */}
                {[
                  { ic: "⏪", label: "−10с" },
                  { ic: playing ? "⏸" : "▶", label: "Пауза" },
                  { ic: "⏩", label: "+10с" },
                  { ic: "⚙", label: "Настройки" },
                  { ic: "✕", label: "Выход" },
                ].map((b, i) => {
                  const f = ctrlIdx === i;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setCtrlIdx(i);
                        if (i === 0) { seek(-10); bumpHideTimer(); }
                        else if (i === 1) { togglePlay(); bumpHideTimer(); }
                        else if (i === 2) { seek(10); bumpHideTimer(); }
                        else if (i === 3) { clearHideTimer(); setSettingsTab(0); setSettingsIdx(0); setOverlay("settings"); }
                        else { exit(); }
                      }}
                      className="rounded-xl font-bold"
                      style={{ ...ringStyle(f, i === 1), padding: i === 1 ? "14px 26px" : "12px 18px", fontSize: i === 1 ? 22 : 16 }}
                      aria-label={b.label}
                    >
                      {b.ic}
                    </button>
                  );
                })}
              </div>
              <p className="mt-4 text-center text-xs text-muted-foreground/50">◀▶ выбор · OK активировать · ▼ скрыть · ↩ выход</p>
            </div>
          )}

          {/* ── SETTINGS PANEL (Качество / Озвучка / Серии) ── overscan-safe. */}
          {overlay === "settings" && (
            <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 backdrop-blur-md" style={{ padding: "4vh 4vw" }}>
              <div className="w-[760px] max-w-[90vw] rounded-2xl border border-white/10 bg-zinc-900/95 p-7">
                {/* Tabs */}
                <div className="mb-5 flex gap-3">
                  {([0, 1, ...(isSeries ? [2 as const] : [])] as Array<0 | 1 | 2>).map((t) => {
                    const f = settingsTab === t;
                    const label = t === 0 ? "Качество" : t === 1 ? "Озвучка" : "Серии";
                    return (
                      <div key={t} className="rounded-xl px-5 py-2.5 text-base font-bold"
                        style={{ ...ringStyle(f, f), color: f ? "#0a0a0a" : "#a1a1aa" }}>
                        {label}
                      </div>
                    );
                  })}
                </div>
                {/* List — scrollable (max-height 60vh) so EVERY item is reachable;
                    the focused row scrollIntoView()s itself. */}
                <div className="overflow-y-auto" style={{ maxHeight: "60vh", scrollbarWidth: "none" }}>
                  {settingsTab === 0 && (
                    <div className="flex flex-col gap-2">
                      {qualities.length === 0 && <p className="text-muted-foreground">Нет вариантов</p>}
                      {qualities.map((q, i) => {
                        const f = settingsIdx === i;
                        const cur = q === quality;
                        return (
                          <button key={q} onClick={() => changeQuality(q)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-lg font-semibold"
                            style={ringStyle(f)}>
                            <span>{q}</span>{cur && <span className="text-sm" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>текущее</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {settingsTab === 1 && (
                    <div className="flex flex-col gap-2">
                      {translators.length === 0 && <p className="text-muted-foreground">Одна озвучка</p>}
                      {translators.map((t, i) => {
                        const f = settingsIdx === i;
                        const cur = t.id === translatorId;
                        return (
                          <button key={t.id} onClick={() => changeTranslator(t.id)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-lg font-semibold"
                            style={ringStyle(f)}>
                            <span>{t.name} {t.is_premium && "🔒"}</span>
                            {cur && <span className="text-sm" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>текущая</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {settingsTab === 2 && isSeries && (
                    <div className="grid grid-cols-2 gap-2">
                      {episodes.map((ep, i) => {
                        const f = settingsIdx === i;
                        const cur = ep.episode_number === episode;
                        return (
                          <button key={ep.episode_number} onClick={() => playEpisode(season, ep.episode_number)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                            style={ringStyle(f)}>
                            <span className="text-lg font-bold tabular-nums" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>{ep.episode_number}</span>
                            <span className="truncate text-base font-medium">{ep.name || `Серия ${ep.episode_number}`}</span>
                            {cur && <span className="ml-auto text-xs" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>▶</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <p className="mt-4 text-center text-xs text-muted-foreground/50">◀▶ вкладка · ▲▼ выбор · OK применить · ↩ назад</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* TOAST */}
      {toast && (
        <div className="absolute bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-primary/30 bg-zinc-900/95 px-6 py-3 text-base font-semibold"
          style={{ color: "var(--primary)" }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes tvspin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
