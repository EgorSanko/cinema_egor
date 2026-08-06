"use client";

import { Subtitles, Check, X, ChevronDown } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

export interface SubtitleOption {
  id: string;
  language: string;
  display: string;
  hi: boolean;
  flagUrl?: string;
  release?: string;
  vttUrl: string;
}

interface SubtitlesMenuProps {
  tmdbId: number;
  season?: number;
  episode?: number;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

const LANG_NAMES_RU: Record<string, string> = {
  ru: "Русский",
  en: "English",
};

export function SubtitlesMenu({ tmdbId, season, episode, videoRef }: SubtitlesMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [subs, setSubs] = React.useState<SubtitleOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [coords, setCoords] = React.useState<{ top: number; left: number; width: number } | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Recalc dropdown position when open, on scroll, and on resize
  const recalc = React.useCallback(() => {
    const b = buttonRef.current;
    if (!b) return;
    const r = b.getBoundingClientRect();
    setCoords({
      top: r.bottom + 8,
      left: r.left,
      width: Math.max(r.width, 240),
    });
  }, []);

  React.useEffect(() => {
    if (!open) return;
    recalc();
    const onScroll = () => recalc();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, recalc]);

  // Close on outside click — buttonRef OR dropdownRef counts as "inside"
  React.useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (dropdownRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Fetch list on first open
  const fetched = React.useRef(false);
  React.useEffect(() => {
    if (!open || fetched.current) return;
    fetched.current = true;
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ tmdb: String(tmdbId) });
    if (season) params.set("season", String(season));
    if (episode) params.set("episode", String(episode));
    fetch(`/api/subtitles?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.subs) setSubs(data.subs);
        else setError(data.error || "Не удалось получить субтитры");
      })
      .catch(() => setError("Сеть недоступна"))
      .finally(() => setLoading(false));
  }, [open, tmdbId, season, episode]);

  // Reset on episode change
  React.useEffect(() => {
    setSelectedId(null);
    setSubs([]);
    fetched.current = false;
    const v = videoRef.current;
    if (v) {
      Array.from(v.querySelectorAll('track[data-source="wyzie"]')).forEach((t) => t.remove());
      const tracks = v.textTracks;
      for (let i = 0; i < tracks.length; i++) tracks[i].mode = "disabled";
    }
  }, [tmdbId, season, episode, videoRef]);

  const applySub = (sub: SubtitleOption | null) => {
    const v = videoRef.current;
    if (!v) return;

    Array.from(v.querySelectorAll('track[data-source="wyzie"]')).forEach((t) => t.remove());
    const tracks = v.textTracks;
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = "disabled";

    if (!sub) {
      setSelectedId(null);
      setOpen(false);
      return;
    }

    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = sub.display + (sub.hi ? " [HI]" : "");
    track.srclang = sub.language;
    track.src = sub.vttUrl;
    track.default = true;
    track.setAttribute("data-source", "wyzie");
    v.appendChild(track);

    setTimeout(() => {
      const tt = Array.from(v.textTracks).find(
        (t) => t.language === sub.language && t.label === track.label,
      );
      if (tt) tt.mode = "showing";
    }, 80);

    setSelectedId(sub.id);
    setOpen(false);
  };

  const current = selectedId ? subs.find((s) => s.id === selectedId) : null;

  const dropdown = open && coords && (
    <div
      ref={dropdownRef}
      style={{
        position: "fixed",
        top: coords.top,
        left: coords.left,
        width: coords.width,
        maxWidth: "calc(100vw - 16px)",
        zIndex: 9999,
      }}
      className="bg-background/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 overflow-hidden max-h-[60vh] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {loading && (
        <div className="px-4 py-6 text-center text-[13px] text-foreground/55">Загружаю…</div>
      )}
      {error && !loading && (
        <div className="px-4 py-6 text-center text-[13px] text-foreground/55">{error}</div>
      )}
      {!loading && !error && subs.length === 0 && (
        <div className="px-4 py-6 text-center text-[13px] text-foreground/55">
          Субтитров не нашли :(
        </div>
      )}
      {!loading && subs.length > 0 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              applySub(null);
            }}
            className={
              "w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors border-b border-white/[0.06] " +
              (selectedId === null
                ? "bg-foreground/[0.06] text-foreground"
                : "text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground")
            }
          >
            <X size={15} className="opacity-60" />
            <span className="flex-1 text-left">Выключить</span>
            {selectedId === null && <Check size={14} className="text-primary" />}
          </button>
          {subs.map((s) => (
            <button
              type="button"
              key={s.id}
              onClick={(e) => {
                e.stopPropagation();
                applySub(s);
              }}
              className={
                "w-full flex items-center gap-3 px-4 py-2.5 text-[13px] transition-colors border-b border-white/[0.04] last:border-0 " +
                (selectedId === s.id
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/80 hover:bg-foreground/[0.05] hover:text-foreground")
              }
            >
              {s.flagUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={s.flagUrl} alt="" className="w-6 h-4 object-cover rounded-sm flex-shrink-0" />
              ) : (
                <span className="w-6 h-4 flex-shrink-0" />
              )}
              <span className="flex-1 text-left min-w-0">
                <span className="block truncate">
                  {LANG_NAMES_RU[s.language] || s.display}
                  {s.hi && <span className="ml-1.5 text-[12px] text-foreground/45 align-middle">HI</span>}
                </span>
                {s.release && (
                  <span className="block text-[12px] text-foreground/40 truncate">{s.release}</span>
                )}
              </span>
              {selectedId === s.id && <Check size={14} className="text-primary flex-shrink-0" />}
            </button>
          ))}
        </>
      )}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={
          "w-full h-12 px-3 rounded-xl ring-1 inline-flex items-center gap-2.5 text-[13px] transition-colors " +
          (current
            ? "bg-primary/15 ring-primary/30 text-primary"
            : "bg-foreground/[0.04] ring-white/[0.06] text-foreground/85 hover:bg-foreground/[0.07]")
        }
      >
        <Subtitles size={16} className="flex-shrink-0 text-foreground/55" />
        <span className="flex-1 text-left min-w-0">
          <span className="block text-[12px] leading-tight uppercase tracking-wide opacity-70">Субтитры</span>
          <span className="block text-[12px] truncate font-medium">
            {current ? (LANG_NAMES_RU[current.language] || current.display) : "Выключены"}
          </span>
        </span>
        <ChevronDown size={14} className={"text-foreground/50 transition-transform flex-shrink-0 " + (open ? "rotate-180" : "")} />
      </button>
      {typeof document !== "undefined" && createPortal(dropdown, document.body)}
    </>
  );
}
