// app/watch/[code]/watch-client.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { connectSocket, disconnectSocket } from "@/lib/socket";
import type { WatchRoomState, ChatMessage, WatchMember } from "@/lib/watch-types";
import Hls from "hls.js";
import {
  Users, Copy, Check, ArrowLeft, Send, Play, Pause, Loader2,
  MessageSquare, X, Share2, Mic, ChevronDown, Maximize, Minimize,
} from "lucide-react";

interface Props { code: string; }

const REACTIONS = ["\u{1F525}", "\u2764\uFE0F", "\u{1F602}", "\u{1F44F}", "\u{1F62E}", "\u{1F622}"];

// Detect touch device (works in landscape too, unlike innerWidth)
const isTouchDevice = () => typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);

export default function WatchClient({ code }: Props) {
  const router = useRouter();
  const [room, setRoom] = useState<WatchRoomState | null>(null);
  const [phase, setPhase] = useState<"connecting" | "lobby" | "loading" | "playing" | "error">("connecting");
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [isHost, setIsHost] = useState(false);
  const [members, setMembers] = useState<WatchMember[]>([]);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Player state
  const [paused, setPaused] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [quality, setQuality] = useState("");
  const [streams, setStreams] = useState<Record<string, string>>({});
  const [translators, setTranslators] = useState<{ id: number; name: string }[]>([]);
  const [translatorId, setTranslatorId] = useState<number | null>(null);
  const [showUI, setShowUI] = useState(true);
  const [notification, setNotification] = useState("");
  const [showTranslatorPanel, setShowTranslatorPanel] = useState(false);
  const [showQualityPanel, setShowQualityPanel] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  const [streamError, setStreamError] = useState("");

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatMode, setChatMode] = useState<"side" | "overlay" | "hidden">("side");
  const [showChatMobile, setShowChatMobile] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [floatingReactions, setFloatingReactions] = useState<{ id: string; emoji: string; by: string }[]>([]);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const uiTimer = useRef<any>(null);
  const heartbeatTimer = useRef<any>(null);
  const ignoreNextEvent = useRef(false);
  const socketRef = useRef<ReturnType<typeof connectSocket> | null>(null);
  const streamUrlRef = useRef("");
  const isHostRef = useRef(false);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);
  // Track if we're in the middle of a seek to prevent heartbeat cascade
  const isSeeking = useRef(false);
  const seekTimer = useRef<any>(null);

  // Keep refs in sync
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);

  // Detect mobile (touch device, not just width - handles landscape) + Telegram
  const [mobile, setMobile] = useState(false);
  const [inTelegram, setInTelegram] = useState(false);
  useEffect(() => {
    const touch = isTouchDevice();
    setMobile(touch);
    if (touch) setChatMode("overlay");
    setInTelegram(!!(window as any).Telegram?.WebApp);
  }, []);

  // Listen for fullscreen changes
  useEffect(() => {
    const handler = () => {
      const fs = !!(document.fullscreenElement || (document as any).webkitFullscreenElement);
      setIsFullscreen(fs);
      if (!fs) setCssFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => {
      document.removeEventListener("fullscreenchange", handler);
      document.removeEventListener("webkitfullscreenchange", handler);
    };
  }, []);

  // Native mousemove listener for fullscreen — React onMouseMove doesn't fire reliably in fullscreen
  useEffect(() => {
    if (phase !== "playing" || mobile) return;
    const handler = () => {
      setShowUI(true);
      clearTimeout(uiTimer.current);
      uiTimer.current = setTimeout(() => {
        setShowUI(false);
        setShowTranslatorPanel(false);
        setShowQualityPanel(false);
        setShowReactions(false);
      }, 5000);
    };
    document.addEventListener("mousemove", handler);
    document.addEventListener("click", handler);
    return () => {
      document.removeEventListener("mousemove", handler);
      document.removeEventListener("click", handler);
    };
  }, [phase, mobile]);

  const notify = useCallback((msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(""), 3000);
  }, []);

  // === HLS LOADER ===
  const loadStream = useCallback((url: string, seekTo?: number) => {
    if (!videoRef.current || !url) return;
    const v = videoRef.current;
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    streamUrlRef.current = url;

    const tryPlay = () => {
      if (seekTo && seekTo > 0) v.currentTime = seekTo;
      v.play().then(() => setPaused(false)).catch(() => setPaused(true));
    };

    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, tryPlay);
    } else {
      v.src = url;
      v.onloadedmetadata = tryPlay;
    }
  }, []);

  // === FETCH STREAM FROM HDREZKA ===
  const fetchStream = useCallback(async (movieTitle: string, movieYear: string, movieType: string, trId?: number, season?: number, episode?: number) => {
    try {
      const q = encodeURIComponent(movieTitle);
      const yr = movieYear ? `&year=${movieYear}` : "";
      const tp = `&type=${movieType}`;
      const ep = movieType === "tv" && season ? `&season=${season}&episode=${episode || 1}` : "";
      const tr = trId ? `&translator_id=${trId}` : "";
      const res = await fetch(`/hdrezka/api/search?q=${q}${yr}${tp}${ep}${tr}`);
      const data = await res.json();

      const processResult = (d: any) => {
        streamUrlRef.current = d.stream;
        setQuality(d.quality);
        setStreams(d.streams || {});
        if (d.translators?.length) setTranslators(d.translators);
        if (d.translators?.[0]?.id && !trId) setTranslatorId(d.translators[0].id);
        if (isHostRef.current && socketRef.current) {
          socketRef.current.emit("set-stream", {
            streamUrl: d.stream, quality: d.quality,
            streams: d.streams || {}, translators: d.translators || [],
            translatorId: trId || d.translators?.[0]?.id || null,
          });
        }
        return d;
      };

      if (data.stream) return processResult(data);

      if (data.results?.length) {
        for (let i = 0; i < Math.min(data.results.length, 3); i++) {
          const res2 = await fetch(`/hdrezka/api/search?q=${q}${yr}${tp}&index=${i}${ep}${tr}`);
          const data2 = await res2.json();
          if (data2.stream) return processResult(data2);
        }
      }
      return null;
    } catch { return null; }
  }, []);

  // === CONNECT TO ROOM ===
  useEffect(() => {
    const savedName = localStorage.getItem("watch_name") || "Guest";
    setName(savedName);

    const socket = connectSocket();
    socketRef.current = socket;

    socket.emit("join-room", { code, name: savedName }, (res) => {
      if (res.error) { setError(res.error); setPhase("error"); return; }
      if (res.room) {
        const r = res.room;
        setRoom(r);
        setMembers(r.members);
        setMessages(r.messages || []);
        const me = r.members.find((m) => m.id === socket.id);
        const amHost = me?.isHost || false;
        setIsHost(amHost);
        isHostRef.current = amHost;

        if (r.state === "lobby") {
          setPhase("lobby");
          if (r.streamUrl) {
            streamUrlRef.current = r.streamUrl;
            setQuality(r.quality || "");
            setStreams(r.streams || {});
            setTranslators(r.translators || []);
            setTranslatorId(r.translatorId || null);
          }
        } else if (r.state === "playing" || r.state === "paused") {
          setPhase("loading");
          if (r.streamUrl) {
            streamUrlRef.current = r.streamUrl;
            setQuality(r.quality || "");
            setStreams(r.streams || {});
            setTranslators(r.translators || []);
            setTranslatorId(r.translatorId || null);
            setTimeout(() => {
              loadStream(r.streamUrl, r.currentTime);
              setPhase("playing");
              if (r.state === "paused") setPaused(true);
            }, 500);
          }
        }
      }
    });

    // === SOCKET EVENT HANDLERS ===
    socket.on("member-joined", ({ member }) => {
      setMembers((prev) => [...prev.filter((m) => m.id !== member.id), member]);
    });
    socket.on("member-left", ({ memberId }) => {
      setMembers((prev) => prev.filter((m) => m.id !== memberId));
    });
    socket.on("member-ready", ({ memberId }) => {
      setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, isReady: true } : m));
    });
    socket.on("room-closed", () => { setError("Комната закрыта"); setPhase("error"); });

    // Player sync — received from OTHER users
    socket.on("player-play", ({ time, by }) => {
      if (videoRef.current) {
        ignoreNextEvent.current = true;
        videoRef.current.currentTime = time;
        videoRef.current.play().catch(() => {});
        setPaused(false);
      }
      notify(`${by} продолжил`);
    });
    socket.on("player-pause", ({ time, by }) => {
      if (videoRef.current) {
        ignoreNextEvent.current = true;
        videoRef.current.pause();
        videoRef.current.currentTime = time;
        setPaused(true);
      }
      notify(`${by} на паузе`);
    });
    socket.on("player-seek", ({ time, by }) => {
      if (videoRef.current) {
        ignoreNextEvent.current = true;
        isSeeking.current = true;
        videoRef.current.currentTime = time;
        // Longer delay for remote seeks — HLS needs time to rebuffer
        clearTimeout(seekTimer.current);
        seekTimer.current = setTimeout(() => { isSeeking.current = false; }, 3000);
      }
      notify(`${by} перемотал`);
    });

    // Heartbeat sync — host sends every 5s, guests adjust
    socket.on("sync-heartbeat", ({ time, state }) => {
      if (!videoRef.current || isSeeking.current) return;
      const diff = Math.abs(videoRef.current.currentTime - time);
      if (diff > 2) {
        ignoreNextEvent.current = true;
        videoRef.current.currentTime = time;
      } else if (diff > 0.5) {
        videoRef.current.playbackRate = videoRef.current.currentTime < time ? 1.03 : 0.97;
        setTimeout(() => { if (videoRef.current) videoRef.current.playbackRate = 1; }, 3000);
      }
      // Force play/pause to match host — with ignoreNextEvent to prevent cascade
      if (state === "playing" && videoRef.current.paused) {
        ignoreNextEvent.current = true;
        videoRef.current.play().catch(() => {});
        setPaused(false);
      } else if (state === "paused" && !videoRef.current.paused) {
        ignoreNextEvent.current = true;
        videoRef.current.pause();
        setPaused(true);
      }
    });

    // Playback start
    socket.on("playback-starting", ({ countdown: c }) => setCountdown(c));
    socket.on("playback-go", () => {
      setCountdown(0);
      setPhase("playing");
      setTimeout(() => {
        if (streamUrlRef.current) loadStream(streamUrlRef.current);
      }, 200);
    });

    // Stream changes
    socket.on("stream-changed", (data) => {
      streamUrlRef.current = data.streamUrl;
      setQuality(data.quality);
      setStreams(data.streams);
      setTranslators(data.translators);
      setTranslatorId(data.translatorId);
    });
    socket.on("quality-changed", ({ quality: q, streamUrl: url, by }) => {
      const ct = videoRef.current?.currentTime || 0;
      setQuality(q);
      streamUrlRef.current = url;
      loadStream(url, ct);
      notify(`${by} сменил качество: ${q}`);
    });
    socket.on("translator-changed", ({ translatorId: id, translatorName, by }) => {
      setTranslatorId(id);
      notify(`${by} сменил озвучку: ${translatorName}`);
    });
    socket.on("episode-changed", ({ season, episode, by }) => {
      notify(`${by} переключил на S${season}E${episode}`);
    });

    // Chat
    socket.on("chat-message", (msg) => {
      setMessages((prev) => [...prev.slice(-199), msg]);
    });
    socket.on("chat-reaction", ({ emoji, by }) => {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      setFloatingReactions((prev) => [...prev, { id, emoji, by }]);
      setTimeout(() => setFloatingReactions((prev) => prev.filter((r) => r.id !== id)), 2500);
    });

    return () => {
      socket.emit("leave-room");
      socket.removeAllListeners();
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      if (hlsRef.current) hlsRef.current.destroy();
      disconnectSocket();
    };
  }, [code, loadStream, notify]);

  // === HOST: Fetch stream in lobby ===
  const retryFetchStream = useCallback(() => {
    if (!room) return;
    setStreamError("");
    streamUrlRef.current = "";
    fetchStream(room.movieTitle, room.movieYear, room.movieType).then((data) => {
      if (data) {
        socketRef.current?.emit("player-ready");
        setMembers((prev) => prev.map((m) => m.isHost ? { ...m, isReady: true } : m));
      } else {
        setStreamError("Фильм недоступен для просмотра. Попробуйте другой.");
      }
    });
  }, [room, fetchStream]);

  useEffect(() => {
    if (phase === "lobby" && isHost && room && !streamUrlRef.current && !streamError) {
      retryFetchStream();
    }
  }, [phase, isHost, room, fetchStream, streamError, retryFetchStream]);

  // === GUEST: Mark ready when stream received ===
  useEffect(() => {
    if (phase === "lobby" && !isHost && streamUrlRef.current) {
      socketRef.current?.emit("player-ready");
      setMembers((prev) => prev.map((m) => m.id === socketRef.current?.id ? { ...m, isReady: true } : m));
    }
  }, [phase, isHost, streams]);

  // === HOST: Heartbeat every 5s ===
  useEffect(() => {
    if (phase === "playing" && isHost) {
      heartbeatTimer.current = setInterval(() => {
        if (videoRef.current && socketRef.current && !isSeeking.current) {
          socketRef.current.emit("sync-heartbeat", {
            time: videoRef.current.currentTime,
            state: videoRef.current.paused ? "paused" : "playing",
          });
        }
      }, 5000);
      return () => { if (heartbeatTimer.current) clearInterval(heartbeatTimer.current); };
    }
  }, [phase, isHost]);

  // === VIDEO EVENTS ===
  useEffect(() => {
    if (phase !== "playing" || !videoRef.current) return;
    const v = videoRef.current;
    const onTimeUpdate = () => { setCurrentTime(v.currentTime); setDuration(v.duration || 0); };
    const onPlay = () => {
      setPaused(false);
      if (ignoreNextEvent.current) { ignoreNextEvent.current = false; return; }
      // Don't emit play during seek — HLS fires play after rebuffer
      if (isSeeking.current) return;
      socketRef.current?.emit("player-play", { time: v.currentTime });
    };
    const onPause = () => {
      setPaused(true);
      if (ignoreNextEvent.current) { ignoreNextEvent.current = false; return; }
      // Don't emit pause during seek — HLS triggers pause on seek
      if (isSeeking.current) return;
      socketRef.current?.emit("player-pause", { time: v.currentTime });
    };
    const onSeeking = () => {
      isSeeking.current = true;
      clearTimeout(seekTimer.current);
    };
    const onSeeked = () => {
      // Delay clearing seek flag to let HLS rebuffer
      clearTimeout(seekTimer.current);
      seekTimer.current = setTimeout(() => { isSeeking.current = false; }, 1500);
      if (ignoreNextEvent.current) { ignoreNextEvent.current = false; return; }
      // Only host can broadcast seeks
      if (isHostRef.current) {
        socketRef.current?.emit("player-seek", { time: v.currentTime });
      }
    };
    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("seeking", onSeeking);
    v.addEventListener("seeked", onSeeked);
    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("seeking", onSeeking);
      v.removeEventListener("seeked", onSeeked);
    };
  }, [phase]);

  // Auto-scroll chat
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // === UI HELPERS ===
  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };
  const shareRoom = () => {
    const url = `https://kino.lead-seek.ru/watch?join=${code}`;
    if (navigator.share) {
      navigator.share({ title: `Смотрим "${room?.movieTitle}" вместе`, text: `Присоединяйся! Код: ${code}`, url }).catch(() => {});
    } else {
      navigator.clipboard.writeText(url).then(() => notify("Ссылка скопирована!"));
    }
  };
  const sendMessage = () => {
    if (!chatInput.trim()) return;
    socketRef.current?.emit("chat-message", { text: chatInput });
    setChatInput("");
  };
  const sendReaction = (emoji: string) => {
    socketRef.current?.emit("chat-reaction", { emoji });
    setShowReactions(false);
  };
  const startPlayback = () => {
    socketRef.current?.emit("start-playback");
  };
  const togglePlayPause = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {});
    } else {
      videoRef.current.pause();
    }
  };
  const changeQuality = (q: string) => {
    if (!streams[q]) return;
    const ct = videoRef.current?.currentTime || 0;
    setQuality(q);
    streamUrlRef.current = streams[q];
    loadStream(streams[q], ct);
    // Only host broadcasts quality change to all; guests change locally
    if (isHost) {
      socketRef.current?.emit("change-quality", { quality: q, streamUrl: streams[q] });
    }
    setShowQualityPanel(false);
  };
  const changeTranslator = async (trId: number) => {
    if (!room) return;
    setShowTranslatorPanel(false);
    setTranslatorId(trId);
    const t = translators.find((t) => t.id === trId);
    notify(`Смена озвучки: ${t?.name || ""}...`);
    const data = await fetchStream(room.movieTitle, room.movieYear, room.movieType, trId);
    if (data) {
      const ct = videoRef.current?.currentTime || 0;
      loadStream(data.stream, ct);
      socketRef.current?.emit("change-translator", { translatorId: trId, translatorName: t?.name || "" });
    }
  };
  const toggleFullscreen = () => {
    const tg = typeof window !== "undefined" && (window as any).Telegram?.WebApp;

    // === EXIT FULLSCREEN ===
    if (isFullscreen || cssFullscreen) {
      if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
        const exit = document.exitFullscreen || (document as any).webkitExitFullscreen;
        if (exit) exit.call(document).catch(() => {});
      }
      if (tg && mobile) {
        try { tg.exitFullscreen(); } catch {}
      }
      setCssFullscreen(false);
      try { screen.orientation.unlock(); } catch {}
      return;
    }

    // === ENTER FULLSCREEN ===
    // Mobile + Telegram: TG API + CSS fullscreen
    if (mobile && tg) {
      try { tg.requestFullscreen(); } catch {}
      try { tg.expand(); } catch {}
      setCssFullscreen(true);
      try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
      return;
    }

    // Standard Fullscreen API (desktop browsers, non-TG mobile)
    const el = playerContainerRef.current || document.documentElement;
    if (!document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      const req = el.requestFullscreen || (el as any).webkitRequestFullscreen;
      if (req) {
        req.call(el).then(() => {
          try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
        }).catch(() => {
          setCssFullscreen(true);
          try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
        });
      } else {
        // Mobile without TG and no Fullscreen API — CSS fallback
        setCssFullscreen(true);
        try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
      }
    }
  };
  const showUIBriefly = () => {
    setShowUI(true);
    clearTimeout(uiTimer.current);
    uiTimer.current = setTimeout(() => {
      setShowUI(false);
      setShowTranslatorPanel(false);
      setShowQualityPanel(false);
      setShowReactions(false);
    }, 5000);
  };
  const fmtT = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
  };
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const getTranslatorName = () => {
    const t = translators.find((t) => t.id === translatorId);
    return t?.name || "Озвучка";
  };

  // ====== ERROR ======
  if (phase === "error") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
            <X size={40} className="text-red-400" />
          </div>
          <p className="text-red-400 text-xl font-semibold mb-2">{error || "Ошибка"}</p>
          <p className="text-gray-500 text-sm mb-6">Комната не найдена или была закрыта</p>
          <button onClick={() => router.push("/watch")} className="px-8 py-3 bg-purple-500 hover:bg-purple-600 rounded-xl text-white font-medium transition-colors">
            Назад
          </button>
        </div>
      </div>
    );
  }

  // ====== CONNECTING ======
  if (phase === "connecting") {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin" />
            <Users size={24} className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-purple-400" />
          </div>
          <p className="text-gray-400 text-lg">Подключение к {code}...</p>
        </div>
      </div>
    );
  }

  // ====== LOBBY ======
  if (phase === "lobby") {
    const hasStream = !!streamUrlRef.current;

    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-black to-gray-950 p-4 pb-24 md:pb-4">
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />

        <div className="relative z-10 w-full max-w-lg mx-auto pt-4">
          <button onClick={() => { socketRef.current?.emit("leave-room"); router.push("/watch"); }}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6">
            <ArrowLeft size={18} /> Выйти
          </button>

          {/* Movie info */}
          <div className="flex gap-4 mb-8">
            {room?.moviePoster && (
              <div className="w-24 h-36 md:w-28 md:h-40 rounded-xl overflow-hidden bg-gray-800 shrink-0 shadow-xl">
                <img src={`/tmdb-img/w200${room.moviePoster}`} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex-1 py-1 min-w-0">
              <h2 className="text-white text-xl md:text-2xl font-bold mb-1 truncate">{room?.movieTitle}</h2>
              <p className="text-gray-500 text-sm mb-3">{room?.movieType === "tv" ? "Сериал" : "Фильм"} {room?.movieYear}</p>
              {streamError ? (
                <div className="text-red-400 text-sm">
                  <p>{streamError}</p>
                  <button onClick={retryFetchStream} className="text-purple-400 underline text-xs mt-1">Попробовать снова</button>
                </div>
              ) : !hasStream ? (
                <div className="flex items-center gap-2 text-yellow-500 text-sm">
                  <Loader2 size={14} className="animate-spin" /> Загрузка потока...
                </div>
              ) : (
                <div className="flex items-center gap-2 text-green-500 text-sm">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" /> Готово к просмотру
                </div>
              )}
            </div>
          </div>

          {/* Room code + share */}
          <div className="bg-white/[0.04] border-2 border-white/10 rounded-2xl p-5 md:p-6 mb-6">
            <p className="text-gray-400 text-sm mb-3 text-center">Код комнаты</p>
            <div className="flex items-center justify-center gap-3 mb-4">
              <span className="text-3xl md:text-4xl font-black text-white tracking-[0.2em] md:tracking-[0.3em] font-mono">{code}</span>
            </div>
            <div className="flex items-center justify-center gap-2 flex-wrap">
              <button onClick={copyCode}
                className="flex items-center gap-2 px-4 py-2.5 bg-white/10 hover:bg-white/15 rounded-xl text-sm text-white transition-colors">
                {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                {copied ? "Скопировано" : "Копировать"}
              </button>
              <button onClick={shareRoom}
                className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/20 hover:bg-purple-500/30 rounded-xl text-sm text-purple-300 transition-colors">
                <Share2 size={16} /> Поделиться
              </button>
            </div>
          </div>

          {/* Members */}
          <div className="mb-6">
            <p className="text-gray-400 text-sm mb-3 flex items-center gap-2">
              <Users size={16} /> Участники ({members.length})
            </p>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3 bg-white/[0.04] rounded-xl border border-white/5 transition-all"
                  style={{ animation: "slideIn 0.3s ease-out" }}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${m.isHost ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white" : "bg-gray-700 text-gray-300"}`}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-white font-medium flex-1 truncate">{m.name}</span>
                  {m.isHost && <span className="text-purple-400 text-xs font-medium px-2 py-0.5 bg-purple-500/10 rounded-md shrink-0">Host</span>}
                  {m.isReady ? (
                    <span className="text-green-400 text-xs flex items-center gap-1 shrink-0"><Check size={12} /> Ready</span>
                  ) : (
                    <Loader2 size={14} className="text-gray-500 animate-spin shrink-0" />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Countdown */}
          {countdown > 0 && (
            <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center z-[70]">
              <div className="text-center">
                <div className="text-[100px] md:text-[120px] font-black text-white leading-none" style={{ animation: "countPulse 1s ease-in-out" }} key={countdown}>
                  {countdown}
                </div>
                <p className="text-gray-400 text-lg mt-4">Начинаем...</p>
              </div>
            </div>
          )}

          {/* Start button / waiting */}
          {isHost ? (
            <>
              <button onClick={startPlayback} disabled={!hasStream || !!streamError}
                className="w-full py-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white font-semibold text-lg rounded-2xl hover:opacity-90 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-lg shadow-purple-500/20 active:scale-[0.98]">
                <Play size={24} fill="white" /> Начать просмотр
              </button>
              {streamError && (
                <p className="text-red-400 text-sm text-center mt-3">Поток не найден. Попробуйте выбрать другой фильм.</p>
              )}
              {!streamError && members.length < 2 && (
                <p className="text-gray-500 text-sm text-center mt-3">Можно начать одному или дождаться гостей</p>
              )}
            </>
          ) : (
            <div className="text-center py-6">
              {hasStream ? (
                <>
                  <div className="flex items-center justify-center gap-2 text-green-400 mb-3">
                    <Check size={20} />
                    <p className="font-medium">Вы готовы</p>
                  </div>
                  <p className="text-gray-500 text-sm">Ожидание начала от хоста</p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-gray-400">Загрузка...</p>
                  <p className="text-gray-600 text-sm mt-1">Хост загружает поток</p>
                </>
              )}
            </div>
          )}
        </div>

        <style>{`
          @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes countPulse { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        `}</style>
      </div>
    );
  }

  // ====== PLAYING ======
  // Show overlay messages: on mobile when chat is closed, on desktop in overlay/fullscreen mode
  const showOverlayMessages = mobile
    ? chatMode === "overlay" && !showChatMobile
    : chatMode === "overlay" || isFullscreen || cssFullscreen;

  return (
    <div ref={playerContainerRef}
      onMouseMove={() => { if (!mobile) showUIBriefly(); }}
      className={`${cssFullscreen ? "fixed inset-0 z-[9999]" : "fixed inset-0 z-[60]"} bg-black flex flex-col md:flex-row select-none overflow-hidden`}>
      {/* Video area */}
      <div className="relative flex-1 min-h-0"
        onClick={() => showUIBriefly()}>
        <video ref={videoRef} className="absolute inset-0 w-full h-full" style={{ objectFit: "contain" }} playsInline />

        {/* Countdown overlay */}
        {countdown > 0 && (
          <div className="absolute inset-0 bg-black/90 flex items-center justify-center z-50">
            <div className="text-[80px] md:text-[120px] font-black text-white leading-none" style={{ animation: "countPulse 1s ease-in-out" }} key={countdown}>
              {countdown}
            </div>
          </div>
        )}

        {/* Floating reactions */}
        <div className="absolute bottom-24 left-1/2 -translate-x-1/2 pointer-events-none z-30">
          {floatingReactions.map((r) => (
            <div key={r.id} className="absolute text-4xl" style={{
              left: `${Math.random() * 100 - 50}px`,
              animation: "floatUp 2.5s ease-out forwards",
            }}>
              {r.emoji}
            </div>
          ))}
        </div>

        {/* Overlay chat messages — bottom-left, above controls */}
        {showOverlayMessages && (
          <div className="absolute bottom-28 left-2 w-[75%] md:bottom-24 md:left-4 md:w-80 max-h-[30vh] overflow-hidden pointer-events-none z-10">
            {messages.slice(-6).map((msg) => (
              <div key={msg.id} className="mb-1.5" style={{ animation: "fadeInOut 10s ease-out forwards" }}>
                <div className="inline-block px-3 py-2 rounded-xl bg-black/70 backdrop-blur-sm max-w-full">
                  {msg.type === "system" ? (
                    <span className="text-gray-300 text-sm italic">{msg.text}</span>
                  ) : (
                    <>
                      <span className="text-purple-300 text-sm font-bold">{msg.author}: </span>
                      <span className="text-white text-base">{msg.text}</span>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Center play/pause — CLICKABLE */}
        {paused && !countdown && phase === "playing" && (
          <div className="absolute inset-0 flex items-center justify-center z-10 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); togglePlayPause(); }}>
            <div className="w-20 h-20 rounded-full bg-white/15 backdrop-blur-xl flex items-center justify-center active:scale-90 transition-transform"
              style={{ animation: "fadeIn 0.2s ease-out" }}>
              <Play size={40} className="text-white ml-1" fill="white" />
            </div>
          </div>
        )}

        {/* Top bar */}
        <div className={`absolute top-0 left-0 right-0 z-20 transition-opacity duration-500 ${showUI || paused ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="bg-gradient-to-b from-black/80 to-transparent px-3 md:px-6 pt-2 md:pt-3 pb-8 flex items-start justify-between"
            style={{ paddingTop: inTelegram && !(isFullscreen || cssFullscreen) ? "56px" : "max(8px, env(safe-area-inset-top))" }}>
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <button onClick={() => { socketRef.current?.emit("leave-room"); if (cssFullscreen) setCssFullscreen(false); router.push("/watch"); }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center">
                <ArrowLeft size={20} className="text-white" />
              </button>
              <div className="min-w-0">
                <p className="text-white font-bold text-sm md:text-lg truncate">{room?.movieTitle}</p>
                <div className="flex items-center gap-2">
                  <span className="text-purple-400 text-xs font-medium">{code}</span>
                  <span className="text-gray-500 text-xs flex items-center gap-1"><Users size={10} /> {members.length}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {/* Chat toggle */}
              <button onClick={() => {
                if (mobile) {
                  setShowChatMobile(!showChatMobile);
                } else {
                  setChatMode(chatMode === "side" ? "overlay" : chatMode === "overlay" ? "hidden" : "side");
                }
              }}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="Чат">
                <MessageSquare size={18} className={chatMode !== "hidden" || showChatMobile ? "text-purple-400" : "text-gray-500"} />
              </button>
              {/* Fullscreen */}
              <button onClick={toggleFullscreen}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" title="На весь экран">
                {isFullscreen || cssFullscreen ? <Minimize size={18} className="text-white" /> : <Maximize size={18} className="text-white" />}
              </button>
            </div>
          </div>
        </div>

        {/* Bottom controls */}
        <div className={`absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-500 ${showUI || paused ? "opacity-100" : "opacity-0 pointer-events-none"}`}>
          <div className="bg-gradient-to-t from-black/90 via-black/50 to-transparent pt-12 pb-2 md:pb-6 px-3 md:px-6"
            style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
            {/* Progress bar — only host can seek */}
            <div className={`w-full h-2 md:h-1.5 bg-white/20 rounded-full mb-3 ${isHost ? "cursor-pointer hover:h-3" : "cursor-default"} transition-all relative group touch-none`}
              onClick={(e) => {
                if (!isHost || !videoRef.current || !duration) return;
                const r = e.currentTarget.getBoundingClientRect();
                const newTime = ((e.clientX - r.left) / r.width) * duration;
                videoRef.current.currentTime = newTime;
              }}
              onTouchEnd={(e) => {
                if (!isHost || !videoRef.current || !duration) return;
                const touch = e.changedTouches[0];
                if (!touch) return;
                const r = e.currentTarget.getBoundingClientRect();
                const newTime = Math.max(0, Math.min(1, (touch.clientX - r.left) / r.width)) * duration;
                videoRef.current.currentTime = newTime;
              }}>
              <div className="absolute h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full" style={{ width: `${progress}%` }} />
              {isHost && <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg md:opacity-0 md:group-hover:opacity-100 transition-opacity"
                style={{ left: `calc(${progress}% - 8px)` }} />}
            </div>

            <div className="flex items-center justify-between gap-2">
              {/* Left controls */}
              <div className="flex items-center gap-1 md:gap-3">
                <button onClick={togglePlayPause}
                  className="p-2 rounded-lg hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center">
                  {paused ? <Play size={22} className="text-white" fill="white" /> : <Pause size={22} className="text-white" fill="white" />}
                </button>
                <span className="text-white/60 text-xs md:text-sm font-mono whitespace-nowrap">{fmtT(currentTime)} / {fmtT(duration)}</span>
              </div>

              {/* Right controls */}
              <div className="flex items-center gap-1">
                {/* Reactions */}
                <div className="relative">
                  <button onClick={() => { setShowReactions(!showReactions); setShowTranslatorPanel(false); setShowQualityPanel(false); }}
                    className="p-2 rounded-lg hover:bg-white/10 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center text-lg">
                    {"\u{1F525}"}
                  </button>
                  {showReactions && (
                    <div className="absolute bottom-full right-0 mb-2 flex gap-1 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl px-2 py-1.5 z-50">
                      {REACTIONS.map((r) => (
                        <button key={r} onClick={() => sendReaction(r)}
                          className="text-xl hover:scale-125 active:scale-90 transition-transform p-1.5 min-w-[40px] min-h-[40px] flex items-center justify-center">{r}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Translator — host only */}
                {isHost && translators.length > 1 && (
                  <div className="relative">
                    <button onClick={() => { setShowTranslatorPanel(!showTranslatorPanel); setShowQualityPanel(false); setShowReactions(false); }}
                      className="flex items-center gap-1 px-2 md:px-3 py-1.5 rounded-lg text-xs font-medium bg-white/10 text-gray-300 hover:bg-white/20 transition-colors min-h-[44px]">
                      <Mic size={12} />
                      <span className="hidden md:inline max-w-[100px] truncate">{getTranslatorName()}</span>
                      <ChevronDown size={12} className={showTranslatorPanel ? "rotate-180" : ""} />
                    </button>
                    {showTranslatorPanel && (
                      <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 min-w-[200px] max-h-[250px] overflow-y-auto">
                        {translators.map((t) => (
                          <button key={t.id} onClick={() => changeTranslator(t.id)}
                            className={`w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${translatorId === t.id ? "text-purple-400 bg-purple-500/5" : "text-gray-300"}`}>
                            {translatorId === t.id && "\u2713 "}{t.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Quality */}
                {Object.keys(streams).length > 1 && (
                  <div className="relative">
                    <button onClick={() => { setShowQualityPanel(!showQualityPanel); setShowTranslatorPanel(false); setShowReactions(false); }}
                      className={`px-2 md:px-3 py-1.5 rounded-lg text-xs font-bold transition-colors min-h-[44px] ${showQualityPanel ? "bg-purple-500 text-white" : "bg-white/10 text-gray-300 hover:bg-white/20"}`}>
                      {quality || "HD"}
                    </button>
                    {showQualityPanel && (
                      <div className="absolute bottom-full right-0 mb-2 bg-gray-900/95 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl z-50 min-w-[120px]">
                        {Object.keys(streams).map((q) => (
                          <button key={q} onClick={() => changeQuality(q)}
                            className={`w-full text-left px-4 py-3 text-sm hover:bg-white/5 transition-colors border-b border-white/5 last:border-0 ${quality === q ? "text-purple-400 bg-purple-500/5 font-bold" : "text-gray-300"}`}>
                            {quality === q && "\u2713 "}{q}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop side chat */}
      {!mobile && chatMode === "side" && (
        <div className="w-80 h-full bg-gray-950 border-l border-white/10 flex flex-col">
          <div className="px-4 py-2.5 border-b border-white/10 flex items-center justify-between shrink-0">
            <span className="text-white font-medium text-sm flex items-center gap-2"><MessageSquare size={14} /> Чат</span>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {members.slice(0, 4).map((m) => (
                  <div key={m.id} className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-gray-950 ${m.isHost ? "bg-purple-500 text-white" : "bg-gray-700 text-gray-300"}`}>
                    {m.name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {members.length > 4 && <div className="w-6 h-6 rounded-full bg-gray-700 flex items-center justify-center text-[10px] text-gray-400 border-2 border-gray-950">+{members.length - 4}</div>}
              </div>
              <button onClick={() => setChatMode("overlay")} className="p-1 rounded hover:bg-white/10" title="Свернуть">
                <X size={14} className="text-gray-500" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 scrollbar-thin">
            {messages.length === 0 && <p className="text-gray-600 text-xs text-center py-4">Сообщений пока нет</p>}
            {messages.map((msg) => (
              <div key={msg.id} className={msg.type === "system" ? "text-center py-1" : ""}>
                {msg.type === "system" ? (
                  <span className="text-gray-600 text-xs italic bg-white/[0.02] px-3 py-1 rounded-full">{msg.text}</span>
                ) : (
                  <div>
                    <span className="text-purple-400 text-xs font-semibold">{msg.author}</span>
                    <p className="text-white text-sm mt-0.5 break-words leading-relaxed">{msg.text}</p>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="px-3 py-1.5 border-t border-white/5 flex items-center gap-0.5 justify-center shrink-0">
            {REACTIONS.map((r) => (
              <button key={r} onClick={() => sendReaction(r)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 transition-all text-base hover:scale-110 active:scale-90">{r}</button>
            ))}
          </div>
          <div className="px-3 py-2.5 border-t border-white/10 shrink-0">
            <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex items-center gap-2">
              <input type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                placeholder="Написать..." maxLength={500}
                className="flex-1 px-4 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:border-purple-500 focus:outline-none transition-colors" />
              <button type="submit" disabled={!chatInput.trim()}
                className="p-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 transition-colors disabled:opacity-30 active:scale-95 shrink-0">
                <Send size={16} className="text-white" />
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Mobile floating chat button — always visible when chat is closed and UI is hidden */}
      {mobile && !showChatMobile && !showUI && !paused && (
        <button onClick={() => setShowChatMobile(true)}
          className="absolute bottom-20 right-3 z-30 w-11 h-11 rounded-full bg-black/60 backdrop-blur-sm border border-white/10 flex items-center justify-center active:scale-90 transition-transform"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}>
          <MessageSquare size={18} className="text-white/70" />
        </button>
      )}

      {/* Mobile chat — right side panel in landscape, bottom sheet in portrait */}
      {mobile && showChatMobile && (
        <div className="absolute inset-0 z-40 flex landscape:flex-row portrait:flex-col portrait:justify-end" onClick={(e) => { if (e.target === e.currentTarget) setShowChatMobile(false); }}>
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowChatMobile(false)} />
          {/* Landscape: right side panel */}
          <div className="relative landscape:ml-auto landscape:h-full landscape:w-72 portrait:w-full bg-gray-950/95 backdrop-blur border-l landscape:border-t-0 portrait:border-t border-white/10 portrait:rounded-t-2xl flex flex-col"
            style={{ maxHeight: "portrait:65vh", animation: "slideUp 0.3s ease-out" }}>
            <div className="px-3 py-2 border-b border-white/10 flex items-center justify-between shrink-0">
              <span className="text-white font-medium text-sm flex items-center gap-2">
                <MessageSquare size={14} /> Чат ({members.length})
              </span>
              <button onClick={() => setShowChatMobile(false)} className="p-2 rounded-lg hover:bg-white/10">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2 min-h-0">
              {messages.length === 0 && <p className="text-gray-600 text-xs text-center py-4">Сообщений пока нет</p>}
              {messages.map((msg) => (
                <div key={msg.id} className={msg.type === "system" ? "text-center py-0.5" : ""}>
                  {msg.type === "system" ? (
                    <span className="text-gray-600 text-xs italic bg-white/[0.02] px-2 py-0.5 rounded-full">{msg.text}</span>
                  ) : (
                    <div>
                      <span className="text-purple-400 text-xs font-semibold">{msg.author}</span>
                      <p className="text-white text-sm mt-0.5 break-words leading-relaxed">{msg.text}</p>
                    </div>
                  )}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
            <div className="px-2 py-1 border-t border-white/5 flex items-center gap-0.5 justify-center shrink-0">
              {REACTIONS.map((r) => (
                <button key={r} onClick={() => sendReaction(r)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/10 text-base active:scale-90">{r}</button>
              ))}
            </div>
            <div className="px-2 pt-1 pb-2 border-t border-white/10 shrink-0" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
              <form onSubmit={(e) => { e.preventDefault(); sendMessage(); chatInputRef.current?.focus(); }} className="flex items-center gap-1.5">
                <input ref={chatInputRef} type="text" value={chatInput} onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Написать..." maxLength={500} autoFocus
                  className="flex-1 px-3 py-2.5 bg-white/[0.06] border border-white/10 rounded-xl text-white text-sm placeholder-gray-600 focus:border-purple-500 focus:outline-none transition-colors" />
                <button type="submit" disabled={!chatInput.trim()}
                  className="p-2.5 rounded-xl bg-purple-500 hover:bg-purple-600 transition-colors disabled:opacity-30 active:scale-95 shrink-0">
                  <Send size={16} className="text-white" />
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Notification toast */}
      {notification && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-2.5 rounded-xl bg-black/80 backdrop-blur-xl border border-white/10 text-white text-sm font-medium max-w-[90vw] text-center"
          style={{ animation: "slideIn 0.3s ease-out" }}>
          {notification}
        </div>
      )}

      {/* CSS Fullscreen close button */}
      {cssFullscreen && (
        <button onClick={() => { setCssFullscreen(false); try { screen.orientation.unlock(); } catch {} }}
          className="fixed top-3 right-3 z-[10000] bg-black/70 backdrop-blur text-white px-3 py-2 rounded-lg text-sm">
          {"\u2715"} Закрыть
        </button>
      )}

      <style>{`
        @keyframes slideIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(100%); } to { opacity: 1; transform: translateY(0); } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInOut { 0% { opacity: 0; transform: translateY(10px); } 10% { opacity: 1; transform: translateY(0); } 85% { opacity: 1; } 100% { opacity: 0; transform: translateY(-5px); } }
        @keyframes countPulse { 0% { transform: scale(0.5); opacity: 0; } 50% { transform: scale(1.1); } 100% { transform: scale(1); opacity: 1; } }
        @keyframes floatUp { 0% { opacity: 1; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-120px) scale(1.5); } }
        .scrollbar-thin::-webkit-scrollbar { width: 4px; }
        .scrollbar-thin::-webkit-scrollbar-track { background: transparent; }
        .scrollbar-thin::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>
    </div>
  );
}
