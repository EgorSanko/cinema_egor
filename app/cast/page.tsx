// app/cast/page.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Hls from "hls.js";

const fmtT = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
};

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

type Panel = null | "quality" | "translator" | "speed" | "episodes";

interface StreamInfo {
  stream: string;
  quality: string;
  streams: Record<string, string>;
  title: string;
  translators?: { id: number; name: string }[];
  selectedTranslator?: number | null;
  searchQuery?: string;
  year?: string;
  season?: number;
  episode?: number;
  isSeries?: boolean;
  totalSeasons?: number;
  totalEpisodes?: number;
  // Media metadata for history
  userEmail?: string;
  mediaId?: number;
  mediaType?: "movie" | "tv";
  poster_path?: string | null;
  vote_average?: number;
  release_date?: string;
  first_air_date?: string;
  episodeName?: string;
}

export default function CastPage() {
  const [status, setStatus] = useState<"input" | "loading" | "playing" | "error">("input");
  const [code, setCode] = useState(["", "", "", ""]);
  const [error, setError] = useState("");

  // Stream state
  const [info, setInfo] = useState<StreamInfo | null>(null);
  const [curStream, setCurStream] = useState("");
  const [curQuality, setCurQuality] = useState("");
  const [curTranslator, setCurTranslator] = useState<number | null>(null);
  const [curTranslatorName, setCurTranslatorName] = useState("");
  const [curSpeed, setCurSpeed] = useState(1);
  const [curSeason, setCurSeason] = useState(1);
  const [curEpisode, setCurEpisode] = useState(1);

  // Player state
  const [paused, setPaused] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [showUI, setShowUI] = useState(true);
  const [activePanel, setActivePanel] = useState<Panel>(null);
  const [notification, setNotification] = useState("");
  const [streamLoading, setStreamLoading] = useState(false);
  const [focusedBtn, setFocusedBtn] = useState(0);
  const [panelIdx, setPanelIdx] = useState(0);
  const [seekbarFocused, setSeekbarFocused] = useState(false);
  const [panelZone, setPanelZone] = useState<"items" | "seasons">("items");
  const [seasonIdx, setSeasonIdx] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const uiTimer = useRef<any>(null);
  const seekDisplay = useRef("");

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 2500);
  }, []);

  // ===== HLS LOADER =====
  const loadStream = useCallback((url: string, seekTo?: number) => {
    if (!videoRef.current || !url) return;
    const v = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const tryPlay = () => {
      if (seekTo && seekTo > 0) v.currentTime = seekTo;
      v.playbackRate = curSpeed;
      v.play().then(() => setPaused(false)).catch(() => setPaused(true));
    };

    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, startLevel: -1 });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) { setError("\u041e\u0448\u0438\u0431\u043a\u0430 \u0432\u043e\u0441\u043f\u0440\u043e\u0438\u0437\u0432\u0435\u0434\u0435\u043d\u0438\u044f"); setStatus("error"); }
      });
    } else {
      v.src = url;
      v.onloadedmetadata = tryPlay;
    }
  }, [curSpeed]);

  // ===== FETCH NEW STREAM (translator/episode change) =====
  const fetchNewStream = useCallback(async (translatorId?: number, season?: number, episode?: number) => {
    if (!info?.searchQuery) return;
    setStreamLoading(true);
    try {
      const q = encodeURIComponent(info.searchQuery);
      const yr = info.year ? `&year=${info.year}` : "";
      const tp = info.isSeries ? "&type=tv" : "&type=movie";
      const s = season ?? curSeason;
      const e = episode ?? curEpisode;
      const ep = info.isSeries ? `&season=${s}&episode=${e}` : "";
      const tr = translatorId ? `&translator_id=${translatorId}` : "";
      const res = await fetch(`/hdrezka/api/search?q=${q}${yr}${tp}${ep}${tr}`);
      const data = await res.json();
      if (data.stream) {
        const ct = videoRef.current?.currentTime || 0;
        setInfo(prev => prev ? { ...prev, streams: data.streams, translators: data.translators?.length ? data.translators : prev.translators } : prev);
        setCurStream(data.stream);
        setCurQuality(data.quality);
        if (translatorId) {
          setCurTranslator(translatorId);
          const t = (info.translators || []).find(t => t.id === translatorId);
          if (t) setCurTranslatorName(t.name);
        }
        if (season !== undefined) setCurSeason(season);
        if (episode !== undefined) setCurEpisode(episode);
        const seekTo = (translatorId && !season && !episode) ? ct : 0;
        loadStream(data.stream, seekTo);
        if (season !== undefined || episode !== undefined) {
          notify(`S${season ?? curSeason}E${episode ?? curEpisode}`);
        }
      } else if (data.error) {
        notify(data.error);
      }
    } catch { notify("\u041e\u0448\u0438\u0431\u043a\u0430 \u0437\u0430\u0433\u0440\u0443\u0437\u043a\u0438"); }
    finally { setStreamLoading(false); }
  }, [info, curSeason, curEpisode, loadStream, notify]);

  // ===== CODE INPUT =====
  const handleInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const c = [...code];
    c[index] = value.slice(-1);
    setCode(c);
    setError("");
    if (value && index < 3) inputRefs.current[index + 1]?.focus();
    if (value && index === 3 && c.every(d => d !== "")) joinRoom(c.join(""));
  };
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !code[index] && index > 0) inputRefs.current[index - 1]?.focus();
    if (e.key === "Enter") { const c = code.join(""); if (c.length === 4) joinRoom(c); }
  };
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 4);
    if (p.length === 4) { setCode(p.split("")); inputRefs.current[3]?.focus(); joinRoom(p); }
  };

  const joinRoom = async (roomCode: string) => {
    setStatus("loading"); setError("");
    try {
      const res = await fetch("/api/tv-room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "join", code: roomCode }) });
      const data = await res.json();
      if (data.error) { setError(data.error === "not_found" ? "\u041a\u043e\u043c\u043d\u0430\u0442\u0430 \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430" : data.error); setStatus("input"); return; }
      if (data.stream) {
        const s = data.stream as StreamInfo;
        setInfo(s);
        setCurStream(s.stream);
        setCurQuality(s.quality);
        setCurTranslator(s.selectedTranslator || null);
        setCurSeason(s.season || 1);
        setCurEpisode(s.episode || 1);
        if (s.translators?.length) {
          const t = s.translators.find(t => t.id === s.selectedTranslator) || s.translators[0];
          setCurTranslatorName(t.name);
        }
        setStatus("playing");
        notify("\u25b6 " + (s.title || ""));
        setTimeout(() => loadStream(s.stream), 200);
      }
    } catch { setError("\u041e\u0448\u0438\u0431\u043a\u0430 \u043f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u044f"); setStatus("input"); }
  };

  // ===== VIDEO EVENTS =====
  useEffect(() => {
    if (status !== "playing" || !videoRef.current) return;
    const v = videoRef.current;
    const onT = () => { setCurrentTime(v.currentTime); setDuration(v.duration || 0); };
    const onPlay = () => setPaused(false);
    const onPause = () => setPaused(true);
    v.addEventListener("timeupdate", onT); v.addEventListener("play", onPlay); v.addEventListener("pause", onPause);
    return () => { v.removeEventListener("timeupdate", onT); v.removeEventListener("play", onPlay); v.removeEventListener("pause", onPause); };
  }, [status]);

  // ===== HISTORY SYNC (every 15s while playing) =====
  useEffect(() => {
    if (status !== "playing" || !info?.userEmail || !info?.mediaId) return;
    const syncHistory = async () => {
      const v = videoRef.current;
      if (!v || v.paused || v.currentTime < 5 || v.duration < 10) return;
      try {
        const historyItem = {
          id: info.mediaId!,
          type: info.mediaType || (info.isSeries ? "tv" : "movie"),
          title: info.title?.split(" S")[0] || info.title || "",
          poster_path: info.poster_path || null,
          vote_average: info.vote_average || 0,
          release_date: info.release_date,
          first_air_date: info.first_air_date,
          watchedAt: Date.now(),
          progress: v.currentTime,
          duration: v.duration,
          season: info.isSeries ? curSeason : undefined,
          episode: info.isSeries ? curEpisode : undefined,
          episodeName: info.episodeName || "",
          quality: curQuality,
        };
        const posKey = info.isSeries
          ? `kino_pos_tv_${info.mediaId}_s${curSeason}e${curEpisode}`
          : `kino_pos_${info.mediaType || "movie"}_${info.mediaId}`;
        const positions: Record<string, any> = {};
        if (v.currentTime / v.duration < 0.95) {
          positions[posKey] = { time: v.currentTime, duration: v.duration, savedAt: Date.now() };
        }
        await fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "save",
            email: info.userEmail,
            data: { favorites: [], history: [historyItem], positions, comments: [] },
          }),
        });
      } catch (e) { console.error("TV history sync error:", e); }
    };
    const interval = setInterval(syncHistory, 15000);
    // Also sync on first play after 5s
    const firstSync = setTimeout(syncHistory, 5000);
    return () => { clearInterval(interval); clearTimeout(firstSync); };
  }, [status, info, curSeason, curEpisode, curQuality]);

  // ===== SHOW/HIDE UI =====
  const hideUI = useCallback(() => {
    setShowUI(false);
    setSeekbarFocused(false);
    document.body.style.cursor = "none";
  }, []);

  const showUIBriefly = useCallback(() => {
    setShowUI(true);
    document.body.style.cursor = "";
    clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => {
      if (!activePanel && !seekbarFocused) hideUI();
    }, 5000);
  }, [activePanel, seekbarFocused, hideUI]);

  // ===== REQUEST FULLSCREEN =====
  const goFullscreen = useCallback(() => {
    const el = document.documentElement;
    try {
      if (el.requestFullscreen) el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
      else if ((el as any).msRequestFullscreen) (el as any).msRequestFullscreen();
    } catch {}
    // Hide cursor when idle
    document.body.style.cursor = "none";
  }, []);

  // Request fullscreen when playing starts
  useEffect(() => {
    if (status === "playing") {
      setTimeout(goFullscreen, 500);
    }
    return () => { document.body.style.cursor = ""; };
  }, [status, goFullscreen]);

  // ===== KEYBOARD / REMOTE =====
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (status !== "playing" || !videoRef.current) return;
      const v = videoRef.current;
      e.preventDefault();

      // === PANEL NAVIGATION ===
      if (activePanel) {
        if (e.key === "Escape" || e.key === "Backspace") { setActivePanel(null); setPanelZone("items"); return; }
        
        // Episode panel - grid navigation + seasons
        if (activePanel === "episodes") {
          const cols = 5;
          const totalEps = info?.totalEpisodes || 1;
          const totalSzn = info?.totalSeasons || 1;

          if (panelZone === "seasons") {
            if (e.key === "ArrowLeft") { setSeasonIdx(Math.max(0, seasonIdx - 1)); return; }
            if (e.key === "ArrowRight") { setSeasonIdx(Math.min(totalSzn - 1, seasonIdx + 1)); return; }
            if (e.key === "ArrowDown") { setPanelZone("items"); setPanelIdx(0); return; }
            if (e.key === "Enter" || e.key === " ") {
              // Select season - triggers re-render with new season
              const newSeason = seasonIdx + 1;
              setCurSeason(newSeason);
              setPanelZone("items");
              setPanelIdx(0);
              return;
            }
            return;
          }

          // Episodes zone (grid)
          if (e.key === "ArrowLeft") { setPanelIdx(Math.max(0, panelIdx - 1)); return; }
          if (e.key === "ArrowRight") { setPanelIdx(Math.min(totalEps - 1, panelIdx + 1)); return; }
          if (e.key === "ArrowUp") {
            if (panelIdx < cols && totalSzn > 1) { setPanelZone("seasons"); setSeasonIdx(curSeason - 1); return; }
            setPanelIdx(Math.max(0, panelIdx - cols));
            return;
          }
          if (e.key === "ArrowDown") { setPanelIdx(Math.min(totalEps - 1, panelIdx + cols)); return; }
          if (e.key === "Enter" || e.key === " ") { changeEpisode(curSeason, panelIdx + 1); return; }
          return;
        }

        // Other panels - linear list
        const getPanelItems = (): string[] => {
          if (activePanel === "quality") return Object.keys(info?.streams || {});
          if (activePanel === "translator") return (info?.translators || []).map(t => String(t.id));
          if (activePanel === "speed") return SPEEDS.map(String);
          return [];
        };
        const items = getPanelItems();
        
        if (e.key === "ArrowUp" || e.key === "ArrowLeft") { setPanelIdx(Math.max(0, panelIdx - 1)); return; }
        if (e.key === "ArrowDown" || e.key === "ArrowRight") { setPanelIdx(Math.min(items.length - 1, panelIdx + 1)); return; }
        if (e.key === "Enter" || e.key === " ") {
          if (activePanel === "quality") { const q = Object.keys(info?.streams || {})[panelIdx]; if (q) changeQuality(q); }
          else if (activePanel === "translator") { const t = (info?.translators || [])[panelIdx]; if (t) changeTranslator(t.id, t.name); }
          else if (activePanel === "speed") { changeSpeed(SPEEDS[panelIdx]); }
          return;
        }
        return;
      }

      // === UI HIDDEN: UP opens navbar ===
      if (!showUI) {
        if (e.key === "ArrowUp") { setShowUI(true); setSeekbarFocused(false); clearTimeout(uiTimer.current); return; }
        if (e.key === "ArrowLeft") { v.currentTime = Math.max(0, v.currentTime - 15); notify("-15\u0441"); return; }
        if (e.key === "ArrowRight") { v.currentTime = Math.min(v.duration, v.currentTime + 15); notify("+15\u0441"); return; }
        if (e.key === "Enter" || e.key === " ") { v.paused ? v.play() : v.pause(); return; }
        if (e.key === "Escape" || e.key === "Backspace") { stopPlayback(); return; }
        return;
      }

      // === SEEKBAR FOCUSED ===
      if (seekbarFocused) {
        if (e.key === "ArrowLeft") { v.currentTime = Math.max(0, v.currentTime - 10); notify(fmtT(v.currentTime)); clearTimeout(uiTimer.current); return; }
        if (e.key === "ArrowRight") { v.currentTime = Math.min(v.duration, v.currentTime + 10); notify(fmtT(v.currentTime)); clearTimeout(uiTimer.current); return; }
        if (e.key === "ArrowDown") { setSeekbarFocused(false); return; }
        if (e.key === "ArrowUp") { return; } // already at top
        if (e.key === "Enter" || e.key === " ") { v.paused ? v.play() : v.pause(); return; }
        if (e.key === "Escape" || e.key === "Backspace") { setSeekbarFocused(false); return; }
        return;
      }

      // === BUTTONS FOCUSED (UI visible, not seekbar) ===
      const btns = getBtnList();
      if (e.key === "ArrowUp") { setSeekbarFocused(true); clearTimeout(uiTimer.current); return; }
      if (e.key === "ArrowDown") { hideUI(); return; }
      if (e.key === "ArrowLeft") {
        if (focusedBtn > 0) setFocusedBtn(focusedBtn - 1);
        return;
      }
      if (e.key === "ArrowRight") {
        if (focusedBtn < btns.length - 1) setFocusedBtn(focusedBtn + 1);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        const btn = btns[focusedBtn];
        if (btn === "playpause") { v.paused ? v.play() : v.pause(); }
        else if (btn === "quality") { setPanelIdx(Math.max(0, Object.keys(info?.streams || {}).indexOf(curQuality))); setActivePanel("quality"); }
        else if (btn === "translator") { setPanelIdx(Math.max(0, (info?.translators || []).findIndex(t => t.id === curTranslator))); setActivePanel("translator"); }
        else if (btn === "speed") { setPanelIdx(Math.max(0, SPEEDS.indexOf(curSpeed))); setActivePanel("speed"); }
        else if (btn === "episodes") { setPanelIdx(Math.max(0, curEpisode - 1)); setPanelZone("items"); setSeasonIdx(curSeason - 1); setActivePanel("episodes"); }
        else if (btn === "stop") stopPlayback();
        return;
      }
      if (e.key === "Escape" || e.key === "Backspace") { hideUI(); return; }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [status, activePanel, showUI, focusedBtn, panelIdx, seekbarFocused, panelZone, seasonIdx, info, curQuality, curTranslator, curSpeed, curSeason, curEpisode, showUIBriefly, hideUI]);

  const stopPlayback = () => {
    // Sync history before stopping
    if (videoRef.current && info?.userEmail && info?.mediaId) {
      const v = videoRef.current;
      if (v.currentTime > 5 && v.duration > 10) {
        const historyItem = {
          id: info.mediaId, type: info.mediaType || (info.isSeries ? "tv" : "movie"),
          title: info.title?.split(" S")[0] || info.title || "",
          poster_path: info.poster_path || null, vote_average: info.vote_average || 0,
          release_date: info.release_date, first_air_date: info.first_air_date,
          watchedAt: Date.now(), progress: v.currentTime, duration: v.duration,
          season: info.isSeries ? curSeason : undefined, episode: info.isSeries ? curEpisode : undefined,
          episodeName: info.episodeName || "", quality: curQuality,
        };
        const posKey = info.isSeries
          ? `kino_pos_tv_${info.mediaId}_s${curSeason}e${curEpisode}`
          : `kino_pos_${info.mediaType || "movie"}_${info.mediaId}`;
        const positions: Record<string, any> = {};
        if (v.currentTime / v.duration < 0.95) {
          positions[posKey] = { time: v.currentTime, duration: v.duration, savedAt: Date.now() };
        }
        fetch("/api/sync", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", email: info.userEmail, data: { favorites: [], history: [historyItem], positions, comments: [] } }),
        }).catch(() => {});
      }
    }
    if (videoRef.current) { videoRef.current.pause(); videoRef.current.src = ""; }
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else if ((document as any).webkitFullscreenElement) (document as any).webkitExitFullscreen();
    } catch {}
    document.body.style.cursor = "default";
    setStatus("input"); setCode(["","","",""]); setInfo(null); setActivePanel(null); setSeekbarFocused(false);
  };

  const getBtnList = (): string[] => {
    const btns = ["playpause"];
    if (info?.translators && info.translators.length > 1) btns.push("translator");
    if (info?.streams && Object.keys(info.streams).length > 1) btns.push("quality");
    btns.push("speed");
    if (info?.isSeries) btns.push("episodes");
    btns.push("stop");
    return btns;
  };

  // Change quality
  const changeQuality = (q: string) => {
    if (!info?.streams[q]) return;
    const ct = videoRef.current?.currentTime || 0;
    setCurQuality(q);
    setCurStream(info.streams[q]);
    loadStream(info.streams[q], ct);
    setActivePanel(null);
    notify(q);
  };

  // Change speed
  const changeSpeed = (s: number) => {
    setCurSpeed(s);
    if (videoRef.current) videoRef.current.playbackRate = s;
    setActivePanel(null);
    notify(s + "x");
  };

  // Change translator
  const changeTranslator = (id: number, name: string) => {
    setCurTranslatorName(name);
    setActivePanel(null);
    fetchNewStream(id);
  };

  // Change episode
  const changeEpisode = (s: number, e: number) => {
    setActivePanel(null);
    fetchNewStream(curTranslator || undefined, s, e);
  };

  useEffect(() => { return () => { if (hlsRef.current) hlsRef.current.destroy(); }; }, []);
  useEffect(() => { if (status === "input") setTimeout(() => inputRefs.current[0]?.focus(), 200); }, [status]);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ========== CODE INPUT SCREEN ==========
  if (status === "input" || status === "loading") {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-gray-950 via-black to-gray-950 flex items-center justify-center select-none">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        <div className="relative z-10 text-center">
          <div className="flex items-center justify-center gap-4 mb-12">
            <div className="w-14 h-14 rounded-2xl bg-red-500 flex items-center justify-center text-2xl font-black text-white shadow-lg shadow-red-500/30">{"\u041a"}</div>
            <span className="text-3xl font-bold text-white">{"\u041a\u0438\u043d\u043e\u0442\u0435\u0430\u0442\u0440 \u0415\u0433\u043e\u0440\u0430"}</span>
          </div>
          <p className="text-gray-400 text-xl mb-6">{"\u0412\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434 \u0441 \u0442\u0435\u043b\u0435\u0444\u043e\u043d\u0430"}</p>
          <div className="flex gap-4 justify-center mb-6" onPaste={handlePaste}>
            {code.map((digit, i) => (
              <input key={i} ref={el => { inputRefs.current[i] = el; }} type="text" inputMode="numeric" maxLength={1} value={digit}
                onChange={e => handleInput(i, e.target.value)} onKeyDown={e => handleKeyDown(i, e)}
                disabled={status === "loading"}
                className="w-24 h-28 text-center text-5xl font-black bg-white/[0.06] border-2 border-white/10 rounded-2xl text-white focus:border-red-500 focus:outline-none transition-colors disabled:opacity-50"
                style={{ caretColor: "transparent", animation: `fadeIn 0.5s ease-out ${i * 0.1}s both` }} />
            ))}
          </div>
          {error && <p className="text-red-400 text-lg mb-4">{error}</p>}
          {status === "loading" && (
            <div className="flex items-center justify-center gap-3 text-gray-400">
              <div className="w-6 h-6 border-2 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
              {"\u041f\u043e\u0434\u043a\u043b\u044e\u0447\u0435\u043d\u0438\u0435..."}
            </div>
          )}
          <p className="text-gray-600 text-sm mt-8">{"\u041d\u0430\u0436\u043c\u0438\u0442\u0435 "}<span className="text-white font-medium">{"\u041d\u0430 \u0422\u0412"}</span>{" \u0432 \u043f\u043b\u0435\u0435\u0440\u0435 \u0438 \u0432\u0432\u0435\u0434\u0438\u0442\u0435 \u043a\u043e\u0434"}</p>
        </div>
        <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}`}</style>
      </div>
    );
  }

  // ========== ERROR ==========
  if (status === "error") {
    return (
      <div className="fixed inset-0 bg-black flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-xl mb-4">{error || "\u041e\u0448\u0438\u0431\u043a\u0430"}</p>
          <button onClick={() => { setStatus("input"); setCode(["","","",""]); setError(""); }}
            className="px-6 py-3 bg-red-500 rounded-xl text-white font-medium">{"\u041d\u0430\u0437\u0430\u0434"}</button>
        </div>
      </div>
    );
  }

  // ========== PLAYER ==========
  const btns = getBtnList();

  return (
    <div className="fixed inset-0 bg-black select-none overflow-hidden"
      style={{ cursor: showUI ? "default" : "none" }}
      onMouseMove={() => { document.body.style.cursor = "default"; showUIBriefly(); }}
      onTouchStart={showUIBriefly}
      onClick={() => { if (!activePanel) showUIBriefly(); }}>
      <video ref={videoRef} className="absolute inset-0 w-full h-full bg-black" style={{ objectFit: "contain" }} playsInline autoPlay
        onClick={() => { if (videoRef.current && !activePanel) videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause(); }} />

      {/* Loading overlay */}
      {streamLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-30">
          <div className="w-12 h-12 border-3 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
        </div>
      )}

      {/* Top bar */}
      <div className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-500 ${showUI || paused ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="h-24 bg-gradient-to-b from-black/80 to-transparent px-10 pt-6 flex items-start justify-between">
          <div>
            <p className="text-white text-2xl font-bold">{info?.title || ""}</p>
            <div className="flex items-center gap-3 mt-1">
              {curQuality && <span className="px-2 py-0.5 bg-red-500/20 text-red-400 text-xs font-bold rounded">{curQuality}</span>}
              {curTranslatorName && <span className="text-gray-400 text-sm">{curTranslatorName}</span>}
              {curSpeed !== 1 && <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 text-xs font-bold rounded">{curSpeed}x</span>}
              {info?.isSeries && <span className="text-gray-400 text-sm">S{curSeason}E{curEpisode}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Paused icon */}
      {paused && !activePanel && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
          <div className="w-24 h-24 rounded-full bg-white/10 backdrop-blur-xl flex items-center justify-center" style={{ animation: "fadeIn 0.2s ease-out" }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3" /></svg>
          </div>
        </div>
      )}

      {/* Bottom controls */}
      <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-500 ${showUI || paused ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
        <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-20 pb-8 px-10">
          {/* Progress bar */}
          <div className={`w-full rounded-full mb-5 cursor-pointer transition-all relative ${seekbarFocused ? "h-3 bg-white/30" : "h-1.5 bg-white/20 hover:h-2.5"}`}
            onClick={(e) => { if (!videoRef.current || !duration) return; const r = e.currentTarget.getBoundingClientRect(); videoRef.current.currentTime = ((e.clientX - r.left) / r.width) * duration; }}>
            <div className={`absolute h-full rounded-full transition-all ${seekbarFocused ? "bg-red-400" : "bg-red-500"}`} style={{ width: `${progress}%` }} />
            {seekbarFocused && (
              <div className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white shadow-lg shadow-white/30 transition-all"
                style={{ left: `calc(${progress}% - 10px)` }} />
            )}
          </div>

          {/* Time + hint */}
          <div className="flex items-center justify-between mb-4">
            <span className="text-white/50 text-sm font-mono">{fmtT(currentTime)} / {fmtT(duration)}</span>
            {seekbarFocused && <span className="text-white/40 text-xs">{"\u2190\u2192 \u043f\u0435\u0440\u0435\u043c\u043e\u0442\u043a\u0430 \u00b710\u0441 \u00a0\u00a0 \u2193 \u043d\u0430\u0437\u0430\u0434"}</span>}
          </div>

          {/* Button bar */}
          <div className="flex items-center gap-3 justify-center flex-wrap">
            {btns.map((btn, i) => {
              const focused = i === focusedBtn;
              const base = "px-5 py-3 rounded-xl text-sm font-bold transition-all duration-200 flex items-center gap-2 ";
              const style = focused
                ? "bg-white text-black scale-110 shadow-lg shadow-white/20"
                : "bg-white/10 text-white/70 hover:bg-white/20";

              if (btn === "playpause") return (
                <button key={btn} className={base + style}
                  onClick={() => { if (videoRef.current) videoRef.current.paused ? videoRef.current.play() : videoRef.current.pause(); }}
                  onFocus={() => setFocusedBtn(i)}>
                  {paused ? "\u25b6 \u041f\u043b\u0435\u0439" : "\u23f8 \u041f\u0430\u0443\u0437\u0430"}
                </button>
              );
              if (btn === "translator") return (
                <button key={btn} className={base + style}
                  onClick={() => setActivePanel("translator")}
                  onFocus={() => setFocusedBtn(i)}>
                  {"\ud83c\udfa4 " + (curTranslatorName || "\u041e\u0437\u0432\u0443\u0447\u043a\u0430")}
                </button>
              );
              if (btn === "quality") return (
                <button key={btn} className={base + style}
                  onClick={() => setActivePanel("quality")}
                  onFocus={() => setFocusedBtn(i)}>
                  {"\ud83d\udcfa " + curQuality}
                </button>
              );
              if (btn === "speed") return (
                <button key={btn} className={base + style}
                  onClick={() => setActivePanel("speed")}
                  onFocus={() => setFocusedBtn(i)}>
                  {"\u23e9 " + curSpeed + "x"}
                </button>
              );
              if (btn === "episodes") return (
                <button key={btn} className={base + style}
                  onClick={() => setActivePanel("episodes")}
                  onFocus={() => setFocusedBtn(i)}>
                  {"\ud83d\udcdc S" + curSeason + "E" + curEpisode}
                </button>
              );
              if (btn === "stop") return (
                <button key={btn} className={base + (focused ? "bg-red-500 text-white scale-110 shadow-lg shadow-red-500/20" : "bg-red-500/10 text-red-400 hover:bg-red-500/20")}
                  onClick={stopPlayback}
                  onFocus={() => setFocusedBtn(i)}>
                  {"\u2715 \u0421\u0442\u043e\u043f"}
                </button>
              );
              return null;
            })}
          </div>
        </div>
      </div>

      {/* ===== PANELS ===== */}
      {activePanel && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm z-40"
          onClick={(e) => { if (e.target === e.currentTarget) setActivePanel(null); }}>

          {/* QUALITY */}
          {activePanel === "quality" && (
            <PanelBox title={"\ud83d\udcfa \u041a\u0430\u0447\u0435\u0441\u0442\u0432\u043e"} onClose={() => setActivePanel(null)}>
              {Object.keys(info?.streams || {}).map((q, i) => (
                <PanelItem key={q} label={q} active={q === curQuality} focused={i === panelIdx} onClick={() => changeQuality(q)} />
              ))}
            </PanelBox>
          )}

          {/* TRANSLATOR */}
          {activePanel === "translator" && (
            <PanelBox title={"\ud83c\udfa4 \u041e\u0437\u0432\u0443\u0447\u043a\u0430"} onClose={() => setActivePanel(null)}>
              {(info?.translators || []).map((t, i) => (
                <PanelItem key={t.id + t.name} label={t.name} active={t.id === curTranslator} focused={i === panelIdx} onClick={() => changeTranslator(t.id, t.name)} />
              ))}
            </PanelBox>
          )}

          {/* SPEED */}
          {activePanel === "speed" && (
            <PanelBox title={"\u23e9 \u0421\u043a\u043e\u0440\u043e\u0441\u0442\u044c"} onClose={() => setActivePanel(null)}>
              {SPEEDS.map((s, i) => (
                <PanelItem key={s} label={s + "x"} active={s === curSpeed} focused={i === panelIdx} onClick={() => changeSpeed(s)} />
              ))}
            </PanelBox>
          )}

          {/* EPISODES */}
          {activePanel === "episodes" && (
            <EpisodePanel
              curSeason={curSeason}
              curEpisode={curEpisode}
              totalSeasons={info?.totalSeasons || 1}
              totalEpisodes={info?.totalEpisodes || 1}
              focusedIdx={panelIdx}
              seasonFocusIdx={seasonIdx}
              panelZone={panelZone}
              onSelect={changeEpisode}
              onClose={() => setActivePanel(null)}
            />
          )}
        </div>
      )}

      {/* Notification */}
      {notification && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-50 px-6 py-3 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 text-white text-lg font-medium"
          style={{ animation: "fadeIn 0.25s ease-out" }}>
          {notification}
        </div>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        html,body{margin:0;padding:0;overflow:hidden;background:#000;width:100%;height:100%}
        ::-webkit-scrollbar{display:none}
        *{scrollbar-width:none}
        video::-webkit-media-controls{display:none!important}
      `}</style>
    </div>
  );
}

// ===== PANEL COMPONENTS =====
function PanelBox({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="bg-gray-900/95 border border-white/10 rounded-2xl p-6 min-w-[280px] max-w-[400px] max-h-[70vh] flex flex-col"
      style={{ animation: "fadeIn 0.2s ease-out" }}>
      <div className="flex items-center justify-between mb-5 shrink-0">
        <h3 className="text-white text-xl font-bold">{title}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl">{"\u2715"}</button>
      </div>
      <div className="space-y-2 overflow-y-auto flex-1 pr-1">{children}</div>
    </div>
  );
}

function PanelItem({ label, active, focused, onClick }: { label: string; active: boolean; focused: boolean; onClick: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (focused && ref.current) ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focused]);
  return (
    <button ref={ref} onClick={onClick}
      className={`w-full text-left px-5 py-3.5 rounded-xl text-base transition-all duration-200 ${
        focused
          ? "bg-white text-black font-bold border-2 border-white scale-105"
          : active
            ? "bg-red-500/15 text-red-400 border-2 border-red-500/40 font-bold"
            : "bg-white/5 text-gray-300 border-2 border-transparent hover:bg-white/10 hover:text-white"
      }`}>
      {active && !focused && "\u2713 "}{focused && active ? "\u25b6 " : ""}{label}
    </button>
  );
}

function EpisodePanel({ curSeason, curEpisode, totalSeasons, totalEpisodes, focusedIdx, seasonFocusIdx, panelZone, onSelect, onClose }: {
  curSeason: number; curEpisode: number; totalSeasons: number; totalEpisodes: number; focusedIdx: number;
  seasonFocusIdx: number; panelZone: "items" | "seasons";
  onSelect: (s: number, e: number) => void; onClose: () => void;
}) {
  const episodes = Array.from({ length: totalEpisodes }, (_, i) => i + 1);
  const seasons = Array.from({ length: totalSeasons }, (_, i) => i + 1);
  const focusedEpRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (panelZone === "items" && focusedEpRef.current) {
      focusedEpRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [focusedIdx, panelZone]);

  return (
    <div className="bg-gray-900/95 border border-white/10 rounded-2xl p-6 min-w-[350px] max-w-[500px] max-h-[70vh] overflow-hidden flex flex-col"
      style={{ animation: "fadeIn 0.2s ease-out" }}>
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-white text-xl font-bold">{"\ud83d\udcdc \u0421\u0435\u0440\u0438\u0438"}</h3>
        <button onClick={onClose} className="text-gray-500 hover:text-white text-2xl">{"\u2715"}</button>
      </div>

      {/* Season picker */}
      {totalSeasons > 1 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {seasons.map((s, i) => (
            <button key={s}
              className={`px-4 py-2 rounded-lg text-sm font-bold shrink-0 transition-all ${
                panelZone === "seasons" && i === seasonFocusIdx
                  ? "bg-white text-black scale-105 ring-2 ring-white"
                  : s === curSeason
                    ? "bg-red-500 text-white"
                    : "bg-white/10 text-gray-400 hover:bg-white/20"
              }`}>
              {"\u0421\u0435\u0437\u043e\u043d " + s}
            </button>
          ))}
        </div>
      )}

      {/* Episode grid */}
      <div className="grid grid-cols-5 gap-2 overflow-y-auto flex-1">
        {episodes.map((e, i) => (
          <button key={e} ref={i === focusedIdx && panelZone === "items" ? focusedEpRef : null}
            onClick={() => onSelect(curSeason, e)}
            className={`py-3 rounded-lg text-sm font-bold transition-all ${
              panelZone === "items" && i === focusedIdx
                ? "bg-white text-black scale-110 ring-2 ring-white"
                : e === curEpisode && curSeason === curSeason
                  ? "bg-red-500 text-white"
                  : "bg-white/5 text-gray-400 hover:bg-white/15 hover:text-white"
            }`}>
            {e}
          </button>
        ))}
      </div>
    </div>
  );
}
