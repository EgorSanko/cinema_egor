"use client";

import Artplayer from "artplayer";
import Hls from "hls.js";
import * as React from "react";

export interface ArtTranslator {
  id: number;
  name: string;
  /** HDRezka premium dub — playing it serves a 60-sec "buy subscription" pre-roll instead of the stream. */
  is_premium?: boolean;
}

export interface ArtSubtitle {
  id: string;
  language: string;
  display: string;
  vttUrl: string;
  release?: string;
}

interface ArtPlayerProps {
  streamUrl: string;
  poster?: string;

  qualities?: Record<string, string>;
  selectedQuality?: string;
  onQualityChange?: (q: string) => void;

  translators?: ArtTranslator[];
  selectedTranslator?: number | null;
  onTranslatorChange?: (id: number) => void;

  subtitles?: ArtSubtitle[];
  selectedSubtitleId?: string | null;
  onSubtitleChange?: (id: string | null) => void;
  /** Called when user opens subtitle menu first time — parent should fetch list */
  onLoadSubtitles?: () => void;

  /** Episode navigation (series only): prev/next buttons in the bottom control
   *  bar. When present, ArtPlayer gets ‹ › controls next to the play button. */
  episodeNav?: { hasPrev: boolean; hasNext: boolean };
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;

  resumeTime?: number;
  /** Position the NEXT source switch should START at (used for quality switches:
   *  the new stream begins here instead of restarting at 0, so the position is
   *  preserved without a jarring reset + re-seek). Consumed once per switch. */
  seekOnSwitch?: number;
  /** When false, mount + buffer the stream but DON'T autoplay (hidden pre-warm).
   *  The parent starts playback via the video ref it gets from onVideoReady. */
  autoStart?: boolean;
  /** When false, the whole player is non-interactive (pointer-events: none) so a
   *  hidden pre-warmed player can't be tapped to bypass the auth gate. */
  interactive?: boolean;
  onVideoReady?: (v: HTMLVideoElement) => void;
  onVideoUnmount?: () => void;
  /** Called once ArtPlayer is mounted. Hands back the ArtPlayer-owned
   *  container element (the one that goes fullscreen). Used by SkipOverlays
   *  to portal itself INTO this container so the overlays survive any
   *  fullscreen mode (web CSS, native HTML5, mobile fullscreen). */
  onPlayerContainerReady?: (el: HTMLElement) => void;
}

// Inline SVG icons for settings menu items
const ICON_DUB =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="22"/></svg>';
const ICON_CC =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 15h4"/><path d="M14 15h3"/><path d="M7 11h2"/><path d="M11 11h6"/></svg>';
const ICON_QUALITY =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const ICON_SPEED =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 14l4-4"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>';
// Prev / next EPISODE (skip-track icons — distinct from seek) for the control bar.
const ICON_PREV_EP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="19 20 9 12 19 4"/><rect x="4" y="5" width="2.2" height="14" rx="1"/></svg>';
const ICON_NEXT_EP =
  '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><polygon points="5 4 15 12 5 20"/><rect x="17.8" y="5" width="2.2" height="14" rx="1"/></svg>';

const SPEEDS = [
  { html: "0.5×", value: 0.5 },
  { html: "0.75×", value: 0.75 },
  { html: "Обычная", value: 1, default: true },
  { html: "1.25×", value: 1.25 },
  { html: "1.5×", value: 1.5 },
  { html: "1.75×", value: 1.75 },
  { html: "2×", value: 2 },
];

const SUBTITLE_OFF = { html: "Выключены", value: "", default: true };

function buildTranslatorSetting(
  list: ArtTranslator[] | undefined,
  selectedId: number | null | undefined,
  onChange?: (id: number) => void,
) {
  if (!list || list.length === 0) return null;
  const current = list.find((t) => t.id === selectedId);
  return {
    name: "kino-translator",
    html: "Озвучка",
    tooltip: current?.name || "Озвучка",
    icon: ICON_DUB,
    width: 280,
    selector: list.map((t) => ({
      // Lock icon flags HDRezka premium dubs (serve a "buy subscription" pre-roll
      // instead of the stream). Users can still try them — some show pre-roll
      // and skip; mileage varies — but the visual warning is worth it.
      html: t.name,
      value: t.id,
      default: t.id === selectedId,
    })),
    onSelect: function (item: any) {
      onChange?.(item.value);
      return item.html;
    },
  };
}

function buildSubtitleSetting(
  list: ArtSubtitle[] | undefined,
  selectedId: string | null | undefined,
  onChange?: (id: string | null) => void,
  onLoad?: () => void,
  loading?: boolean,
) {
  // Always show subtitle menu — empty list triggers onLoad on first hover
  const items: any[] = [
    {
      html: "Выключены",
      value: "",
      default: !selectedId,
    },
  ];
  if (list && list.length > 0) {
    for (const s of list) {
      items.push({
        html: s.display + (s.release ? ` · ${s.release.slice(0, 30)}` : ""),
        value: s.id,
        default: s.id === selectedId,
      });
    }
  } else if (loading) {
    items.push({ html: "Загружаю…", value: "__loading__" });
  }
  const current = list?.find((s) => s.id === selectedId);
  return {
    name: "kino-subtitle",
    html: "Субтитры",
    tooltip: current?.display || "Выключены",
    icon: ICON_CC,
    width: 240,
    selector: items,
    onSelect: function (item: any) {
      if (item.value === "__loading__") return item.html;
      if (!item.value) {
        onChange?.(null);
      } else {
        onChange?.(item.value);
      }
      if (!list || list.length === 0) onLoad?.();
      return item.html;
    },
  };
}

function buildQualitySetting(
  qualities: Record<string, string> | undefined,
  selectedQuality: string | undefined,
  onChange?: (q: string) => void,
) {
  if (!qualities) return null;
  const keys = Object.keys(qualities);
  if (keys.length === 0) return null;
  // Rank by real quality, not naive parseInt: "2K"/"4K" labels have no sortable
  // number, and "1080p Ultra" (higher-bitrate 1080) must sit ABOVE plain
  // "1080p" even though both parseInt to 1080.
  const qRank = (q: string) => {
    const s = q.toLowerCase();
    let n = parseInt(s) || 0;
    if (s.includes("4k") || s.includes("2160")) n = 2160;
    else if (s.includes("2k") || s.includes("1440")) n = 1440;
    if (s.includes("ultra")) n += 1; // Ultra ranks just above same-resolution
    return n;
  };
  const sorted = keys.sort((a, b) => qRank(b) - qRank(a));
  return {
    name: "kino-quality",
    html: "Качество",
    tooltip: selectedQuality || "Auto",
    icon: ICON_QUALITY,
    width: 180,
    selector: sorted.map((q) => ({
      html: q,
      value: q,
      default: q === selectedQuality,
    })),
    onSelect: function (item: any) {
      onChange?.(item.value);
      return item.html;
    },
  };
}

function buildSpeedSetting(art: Artplayer) {
  // Pre-mark the current rate as `default: true` so ArtPlayer's setting
  // shows the right initial tooltip + checkmark. Without this, the menu
  // always opens with "Обычная" selected even after the user changed
  // speed (because the SPEEDS array is shared and we mutate it below to
  // keep state in sync).
  const cur = art.playbackRate || 1;
  const selector = SPEEDS.map(s => ({ ...s, default: s.value === cur }));
  return {
    name: "kino-speed",
    html: "Скорость",
    tooltip: (selector.find(s => s.default) || SPEEDS[2]).html,
    icon: ICON_SPEED,
    width: 180,
    selector,
    onSelect: function (item: any) {
      art.playbackRate = item.value;
      return item.html;
    },
  };
}

export function ArtPlayerView(props: ArtPlayerProps) {
  const {
    streamUrl,
    poster,
    qualities,
    selectedQuality,
    onQualityChange,
    translators,
    selectedTranslator,
    onTranslatorChange,
    subtitles,
    selectedSubtitleId,
    onSubtitleChange,
    onLoadSubtitles,
    episodeNav,
    onPrevEpisode,
    onNextEpisode,
    resumeTime,
    seekOnSwitch,
    autoStart,
    interactive = true,
    onVideoReady,
    onVideoUnmount,
    onPlayerContainerReady,
  } = props;

  const containerRef = React.useRef<HTMLDivElement>(null);
  const artRef = React.useRef<Artplayer | null>(null);
  const hlsRef = React.useRef<Hls | null>(null);
  const subsLoadedRef = React.useRef(false);
  const resumeOnceRef = React.useRef(false);
  // Mirror resumeTime in a ref so the mount-only effect always reads the
  // latest value — useState in the parent sets resumeTime AFTER mount.
  const resumeTimeRef = React.useRef(resumeTime);
  React.useEffect(() => { resumeTimeRef.current = resumeTime; }, [resumeTime]);
  const autoStartRef = React.useRef(autoStart);
  React.useEffect(() => { autoStartRef.current = autoStart; }, [autoStart]);
  // One-shot start position for the next source switch (quality switch keeps the
  // current position). Synced from the prop BEFORE the switchUrl effect runs;
  // consumed (→0) once the switch starts so it never leaks to a later switch.
  const startPosOverrideRef = React.useRef(0);
  React.useEffect(() => {
    if (seekOnSwitch && seekOnSwitch > 1) startPosOverrideRef.current = seekOnSwitch;
  }, [seekOnSwitch]);
  // When the parent reveals a pre-warmed (paused, pre-buffered) player, start
  // playback — gives an instant start because the buffer is already filled.
  React.useEffect(() => {
    if (!autoStart) return;
    const art = artRef.current;
    const v = art?.video;
    if (v && v.paused) {
      v.play().catch(() => { try { (art as any).muted = true; v.play().catch(() => {}); } catch {} });
    }
  }, [autoStart]);

  // Episode-nav state + handlers mirrored so the control-bar ‹ › buttons (added
  // once at ready) always read the LATEST prev/next availability, and reflect
  // disabled styling when there's no prev/next episode.
  const navRef = React.useRef<{ hasPrev: boolean; hasNext: boolean; onPrev?: () => void; onNext?: () => void }>(
    { hasPrev: false, hasNext: false, onPrev: onPrevEpisode, onNext: onNextEpisode });
  React.useEffect(() => {
    navRef.current = { hasPrev: !!episodeNav?.hasPrev, hasNext: !!episodeNav?.hasNext, onPrev: onPrevEpisode, onNext: onNextEpisode };
    const p = (artRef.current as any)?.template?.$player as HTMLElement | undefined;
    if (!p) return;
    const set = (sel: string, on: boolean) => {
      const el = p.querySelector(sel) as HTMLElement | null;
      if (el) { el.style.opacity = on ? "1" : "0.35"; el.style.pointerEvents = on ? "auto" : "none"; el.style.cursor = on ? "pointer" : "not-allowed"; }
    };
    set(".art-control-kino-prev-ep", navRef.current.hasPrev);
    set(".art-control-kino-next-ep", navRef.current.hasNext);
  }, [episodeNav, onPrevEpisode, onNextEpisode]);

  // Mount ArtPlayer once; switch URL via switchUrl on changes
  React.useEffect(() => {
    if (!containerRef.current || !streamUrl) return;

    const art = new Artplayer({
      container: containerRef.current,
      url: streamUrl,
      poster: poster || "",
      theme: "#a3e635",
      setting: true,
      fullscreen: true,
      fullscreenWeb: true,
      pip: true,
      airplay: true,
      hotkey: true,
      // Disable ArtPlayer's mobile full-screen swipe-to-seek gesture. It hijacked
      // ordinary finger swipes (iOS notification shade pull, Android nav gestures)
      // and scrubbed the timeline / restarted the episode. With this off, the
      // full-screen touchmove-seek on $video is gone, but the progress-bar drag
      // ($progress, ungated) AND our custom double-tap ±10s still work. Desktop
      // is unaffected — the gesture block is mobile-only.
      gesture: false,
      autoOrientation: true,
      autoSize: false,
      miniProgressBar: true,
      mutex: true,
      backdrop: true,
      moreVideoAttr: { crossOrigin: "anonymous", playsInline: true },
      lang: "ru",
      // Subtitle defaults — switched dynamically below
      subtitle: { url: "", type: "vtt", encoding: "utf-8" },
      customType: {
        m3u8: function (video: HTMLVideoElement, url: string) {
          if (hlsRef.current) {
            try { hlsRef.current.destroy(); } catch {}
            hlsRef.current = null;
          }
          if (Hls.isSupported()) {
            // Start loading DIRECTLY at the saved position when "Продолжить"
            // passed a resumeTime — avoids the jarring load-from-0-then-jump.
            // -1 = normal start from 0 (the "Смотреть" path passes no resume).
            // A quality switch passes the live position via startPosOverrideRef
            // so the new stream begins THERE (no reset-to-0 + re-seek fight).
            const _rt = startPosOverrideRef.current || resumeTimeRef.current;
            const hls = new Hls({
              enableWorker: true,
              startPosition: (_rt && _rt > 5) ? _rt : -1,
              // Faster cold start: prefetch the first fragment while the (large,
              // full-movie) HDRezka manifest is still parsing.
              startFragPrefetch: true,
              backBufferLength: 30,
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hlsRef.current = hls;
            // Auto-recover from transient network errors
            let netRetries = 0;
            let mediaRetries = 0;
            hls.on(Hls.Events.ERROR, (_evt, data) => {
              if (!data.fatal) return;
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries < 4) {
                netRetries++;
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && mediaRetries < 2) {
                mediaRetries++;
                hls.recoverMediaError();
              }
            });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
          }
        },
      },
    });

    artRef.current = art;

    // Notify parent that ArtPlayer is initialized — but DO NOT seek here.
    // `ready` fires before MSE attaches the stream, so currentTime gets reset
    // when the source actually loads. Parent's onVideoReady can save the ref
    // and start any save-interval, but actual position restore must wait
    // until loadedmetadata so the seek sticks.
    art.on("ready", () => {
      onVideoReady?.(art.video);

      // Prev/next EPISODE buttons in the bottom control bar (series only) —
      // Alloha-style. Added once; the click reads the latest availability from
      // navRef, and the effect above keeps their disabled styling in sync.
      if (onPrevEpisode || onNextEpisode) {
        try {
          art.controls.add({
            name: "kino-prev-ep", position: "left", html: ICON_PREV_EP, tooltip: "Предыдущая серия",
            click: () => { const n = navRef.current; if (n.hasPrev) n.onPrev?.(); },
          });
          art.controls.add({
            name: "kino-next-ep", position: "left", html: ICON_NEXT_EP, tooltip: "Следующая серия",
            click: () => { const n = navRef.current; if (n.hasNext) n.onNext?.(); },
          });
          const p = (art as any)?.template?.$player as HTMLElement | undefined;
          const set = (sel: string, on: boolean) => {
            const el = p?.querySelector(sel) as HTMLElement | null;
            if (el) { el.style.opacity = on ? "1" : "0.35"; el.style.pointerEvents = on ? "auto" : "none"; }
          };
          set(".art-control-kino-prev-ep", navRef.current.hasPrev);
          set(".art-control-kino-next-ep", navRef.current.hasNext);
        } catch {}
      }

      // Autoplay so a single "Смотреть" click starts the video — no second
      // Play press (and no "tap once for controls, tap again for play" on
      // mobile). The original click is a user gesture but it's lost across the
      // async stream fetch, so browsers may block UNMUTED autoplay. Fall back
      // to muted autoplay (always allowed) — the video still starts instantly,
      // and the user can unmute with one tap if the browser muted it.
      const tryAutoplay = () => {
        try {
          const p = art.video.play();
          if (p && typeof p.catch === "function") {
            p.catch(() => {
              try {
                art.muted = true;
                art.video.play().catch(() => {});
              } catch {}
            });
          }
        } catch {}
      };
      // Skip autoplay during a hidden pre-warm (autoStart === false) — the
      // parent starts playback when the user actually presses play.
      if (autoStartRef.current !== false) tryAutoplay();

      try {
        const playerEl = (art as any)?.template?.$player as HTMLElement | undefined;
        if (playerEl) onPlayerContainerReady?.(playerEl);
      } catch {}

      // Double-tap seek: matches YouTube / Netflix. Tap-tap left half → -10s,
      // right half → +10s. We attach to the player element (touch-only) and
      // use a 300ms double-tap window. Single-tap is left to ArtPlayer (it
      // toggles controls). A brief visual flash shows direction + amount.
      try {
        const playerEl = (art as any)?.template?.$player as HTMLElement | undefined;
        if (!playerEl) return;
        let lastTap = 0;
        let lastX = 0;
        const SEEK_SECS = 10;
        const flash = (direction: "back" | "fwd") => {
          const overlay = document.createElement("div");
          overlay.textContent = direction === "back" ? "⏪ −10 с" : "+10 с ⏩";
          overlay.style.cssText = `
            position: absolute;
            ${direction === "back" ? "left: 12%" : "right: 12%"};
            top: 50%;
            transform: translateY(-50%);
            z-index: 2147483646;
            background: rgba(0,0,0,0.72);
            color: white;
            font-size: 22px;
            font-weight: 700;
            padding: 14px 24px;
            border-radius: 999px;
            pointer-events: none;
            animation: kino-seek-flash 600ms ease-out forwards;
          `;
          playerEl.appendChild(overlay);
          setTimeout(() => overlay.remove(), 600);
        };
        // Inject the keyframe once
        if (!document.getElementById("kino-seek-flash-style")) {
          const s = document.createElement("style");
          s.id = "kino-seek-flash-style";
          s.textContent = "@keyframes kino-seek-flash { 0%{opacity:0;transform:translateY(-50%) scale(0.85);} 30%{opacity:1;transform:translateY(-50%) scale(1.05);} 100%{opacity:0;transform:translateY(-50%) scale(1);} }";
          document.head.appendChild(s);
        }
        const onTouch = (e: TouchEvent) => {
          const now = Date.now();
          const x = e.changedTouches[0]?.clientX ?? 0;
          const rect = playerEl.getBoundingClientRect();
          const rel = x - rect.left;
          // Ignore taps in the bottom 60px (controls), top 50px (settings)
          const y = e.changedTouches[0]?.clientY ?? 0;
          const relY = y - rect.top;
          if (relY < 50 || relY > rect.height - 60) { lastTap = 0; return; }
          if (now - lastTap < 350 && Math.abs(x - lastX) < 120) {
            // Double tap detected
            const v = art.video as HTMLVideoElement;
            if (rel < rect.width / 2) {
              v.currentTime = Math.max(0, v.currentTime - SEEK_SECS);
              flash("back");
            } else {
              v.currentTime = Math.min(v.duration || Infinity, v.currentTime + SEEK_SECS);
              flash("fwd");
            }
            lastTap = 0; // reset so triple-tap doesn't double-fire
            e.preventDefault();
            e.stopPropagation();
          } else {
            lastTap = now;
            lastX = x;
          }
        };
        playerEl.addEventListener("touchend", onTouch, { passive: false });
      } catch {}

      // Auto-hide the mouse cursor after a few seconds of inactivity while
      // playing. ArtPlayer's built-in `art-hide-cursor` doesn't reliably fire
      // with our CSS / Telegram fullscreen + portalled overlays, so we drive it
      // ourselves on the player element (covers all descendants via the `*`
      // rule). Any mouse movement brings it straight back.
      try {
        const playerEl = (art as any)?.template?.$player as HTMLElement | undefined;
        if (playerEl) {
          if (!document.getElementById("kino-hide-cursor-style")) {
            const st = document.createElement("style");
            st.id = "kino-hide-cursor-style";
            st.textContent = ".kino-cursor-idle, .kino-cursor-idle * { cursor: none !important; }";
            document.head.appendChild(st);
          }
          let idleTimer: ReturnType<typeof setTimeout> | null = null;
          const hide = () => {
            if (!art.video.paused) playerEl.classList.add("kino-cursor-idle");
          };
          const show = () => {
            playerEl.classList.remove("kino-cursor-idle");
            if (idleTimer) clearTimeout(idleTimer);
            if (!art.video.paused) idleTimer = setTimeout(hide, 2500);
          };
          playerEl.addEventListener("mousemove", show);
          playerEl.addEventListener("mouseleave", () => {
            if (idleTimer) clearTimeout(idleTimer);
            hide();
          });
          art.on("play", show);
          art.on("pause", () => {
            if (idleTimer) clearTimeout(idleTimer);
            playerEl.classList.remove("kino-cursor-idle");
          });
          show();
        }
      } catch {}
    });

    // Auto-resume position. The seek must happen AFTER MSE parses the
    // manifest — otherwise the source-swap resets currentTime to 0. We hook
    // multiple events to catch the right moment regardless of which fires
    // first, and we also fire immediately if metadata is already parsed by
    // the time our listener attaches (race with HLS init).
    // Auto-resume position. Multiple events because the timing of when a
    // seek "sticks" depends on HLS buffer state. Watchdog: after the seek,
    // verify currentTime is near resumeTime — if it got reset to 0 (HLS
    // didn't have the position buffered yet), re-seek.
    const tryResume = () => {
      if (resumeOnceRef.current) return;
      // Quality / dub switch passes the live position via startPosOverrideRef;
      // "Продолжить" passes the saved position via resumeTime. Seek to whichever
      // is set once the fresh stream's metadata is ready (reliable — hls.js
      // startPosition alone didn't stick across a switchUrl).
      const t = startPosOverrideRef.current || resumeTimeRef.current;
      if (!t || t <= 5) return;
      if (!art.video || art.video.readyState < 1) return;
      resumeOnceRef.current = true;
      startPosOverrideRef.current = 0; // consumed — committed to seeking t now
      try { art.video.currentTime = t; } catch {}
      // Watchdog: if something else (browser, HLS, ArtPlayer) seeks back
      // to 0 within a second, force the seek again. Try up to 5 times,
      // 800ms apart, then give up.
      let attempts = 0;
      const watch = () => {
        attempts++;
        if (!art.video || attempts > 5) return;
        if (art.video.currentTime < 5 && t > 5) {
          try { art.video.currentTime = t; } catch {}
          setTimeout(watch, 800);
        }
      };
      setTimeout(watch, 800);
    };
    art.video.addEventListener("loadedmetadata", tryResume);
    art.video.addEventListener("durationchange", tryResume);
    art.video.addEventListener("canplay", tryResume);
    setTimeout(tryResume, 100);
    setTimeout(tryResume, 500);

    // Keep the "Скорость" setting tooltip in sync with the actual playback
    // rate. ArtPlayer's setting tooltip is set once at render — it doesn't
    // auto-update on selector picks or external rate changes. We rebuild
    // the whole setting on every ratechange so the parent row reflects
    // the current speed (e.g. "1.5×" instead of stale "Обычная").
    const onRateChange = () => {
      try {
        art.setting.remove("kino-speed");
        art.setting.add(buildSpeedSetting(art));
      } catch {}
    };
    art.video.addEventListener("ratechange", onRateChange);

    // Resume HLS load when tab becomes visible again
    const onVis = () => {
      if (document.visibilityState !== "visible") return;
      const v = art.video;
      const hls = hlsRef.current;
      if (v && hls && v.readyState < 3 && !v.error) {
        try { hls.startLoad(); } catch {}
      }
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      art.video?.removeEventListener("loadedmetadata", tryResume);
      art.video?.removeEventListener("durationchange", tryResume);
      art.video?.removeEventListener("canplay", tryResume);
      art.video?.removeEventListener("ratechange", onRateChange);
      onVideoUnmount?.();
      if (hlsRef.current) {
        try { hlsRef.current.destroy(); } catch {}
        hlsRef.current = null;
      }
      art.destroy(false);
      artRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stream URL change — switch source. Always start from 0 on a fresh
  // source UNLESS the parent passes resumeTime (saved position to seek
  // to). The previous behavior tried to preserve currentTime across
  // switches, which caused the "next episode starts where previous one
  // stopped" bug. Quality switches will now lose position too — accept
  // this trade-off since quality changes are rare and the episode-switch
  // bug was a much more visible regression.
  React.useEffect(() => {
    const art = artRef.current;
    if (!art || !streamUrl) return;
    if (art.url === streamUrl) return;
    const wasPlaying = !art.video.paused;
    // Reset resume guard so the loadedmetadata listener will re-seek to
    // the new resumeTime (if any) when the fresh source loads.
    resumeOnceRef.current = false;
    art.switchUrl(streamUrl).then(() => {
      // startPosOverrideRef is consumed inside tryResume (after the new stream's
      // metadata loads) — don't clear it here, or the seek loses its target.
      if (wasPlaying) art.play().catch(() => {});
    });
  }, [streamUrl]);

  // Subtitle URL change
  React.useEffect(() => {
    const art = artRef.current;
    if (!art) return;
    const sub = subtitles?.find((s) => s.id === selectedSubtitleId);
    if (sub) {
      art.subtitle.url = sub.vttUrl;
      art.subtitle.show = true;
    } else {
      art.subtitle.show = false;
    }
  }, [selectedSubtitleId, subtitles]);

  // Rebuild settings menu on relevant prop change
  React.useEffect(() => {
    const art = artRef.current;
    if (!art) return;

    // Remove our items if present (id starts with "kino-")
    ["kino-translator", "kino-subtitle", "kino-quality", "kino-speed", "kino-miniprogress"].forEach((name) => {
      try { art.setting.remove(name); } catch {}
    });

    const trItem = buildTranslatorSetting(translators, selectedTranslator, onTranslatorChange);
    if (trItem) art.setting.add(trItem);

    // Subtitle UI hidden by user request (2026-05) — wyzie integration
    // wasn't reliably delivering tracks for our catalog and users weren't
    // engaging with the feature. Keep buildSubtitleSetting code around in
    // case we revive a curated subtitle source later, but don't surface
    // the menu item.
    void buildSubtitleSetting;
    void subtitles;
    void selectedSubtitleId;
    void onSubtitleChange;
    void onLoadSubtitles;

    const qItem = buildQualitySetting(qualities, selectedQuality, onQualityChange);
    if (qItem) art.setting.add(qItem);

    art.setting.add(buildSpeedSetting(art));

    // Per-viewer toggle for the green mini progress bar at the bottom of the
    // fullscreen player. A channel poll split ~50/50 (some like seeing how much
    // is left, some feel it spoils the ending), so instead of a global on/off
    // let each viewer decide. Default ON (unset === visible). Persisted in
    // localStorage; hidden live via a container class (see globals.css
    // .hide-mini-bar .art-mini-progress-bar). The bar itself is always built
    // (miniProgressBar:true) so the toggle can show it again without a reload.
    const miniOn = (() => { try { return localStorage.getItem("kino_mini_progress") !== "off"; } catch { return true; } })();
    containerRef.current?.classList.toggle("hide-mini-bar", !miniOn);
    art.setting.add({
      name: "kino-miniprogress",
      html: "Полоска прогресса",
      tooltip: miniOn ? "Показана" : "Скрыта",
      switch: miniOn,
      onSwitch: function (item: any) {
        const next = !item.switch;
        item.tooltip = next ? "Показана" : "Скрыта";
        try { localStorage.setItem("kino_mini_progress", next ? "on" : "off"); } catch {}
        containerRef.current?.classList.toggle("hide-mini-bar", !next);
        return next;
      },
    });
  }, [
    translators,
    selectedTranslator,
    subtitles,
    selectedSubtitleId,
    qualities,
    selectedQuality,
    onTranslatorChange,
    onSubtitleChange,
    onQualityChange,
    onLoadSubtitles,
  ]);

  return (
    <div
      ref={containerRef}
      className={"art-player-host w-full aspect-video bg-black rounded-2xl overflow-hidden ring-1 ring-white/[0.06]" + (interactive ? "" : " pointer-events-none")}
    />
  );
}
