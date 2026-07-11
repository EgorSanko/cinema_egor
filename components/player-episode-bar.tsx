"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, ChevronLeft, ChevronRight } from "lucide-react";
import type { TVEpisode } from "@/lib/tmdb";

type Dub = { id: number; name: string };
type Season = { season_number: number };

interface Props {
  container: HTMLElement | null;
  seasons: Season[];
  episodes: TVEpisode[];      // gated to current season/dub
  dubs: Dub[];                // dubs that have the current episode
  selectedSeason: number;
  selectedEpisode: number;
  selectedTranslator: number | null;
  onSeason: (season: number) => void;
  onEpisode: (episode: number) => void;
  onDub: (id: number) => void;
  // Prev/next EPISODE (handles season boundaries in the parent). On desktop the
  // arrows live in the bottom control bar; on mobile that bar is too narrow, so
  // we surface them here in the top bar (mobile-only) — otherwise phones had no
  // in-player episode navigation at all.
  hasPrev?: boolean;
  hasNext?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
}

/**
 * Alloha-style control bar over the player: Season / Episode / Dub as inline
 * dropdown pills at the top-left, plus prev/next episode arrows — always
 * reachable in one click instead of buried in the settings gear or living below
 * the player. Rendered via a portal INTO the ArtPlayer container so it survives
 * fullscreen. Green (brand) theme, not Alloha's blue.
 */
export function PlayerEpisodeBar(props: Props) {
  const { container, seasons, episodes, dubs, selectedSeason, selectedEpisode, selectedTranslator } = props;
  const [open, setOpen] = useState<null | "season" | "episode" | "dub">(null);
  const rootRef = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(null); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDoc, true); document.removeEventListener("keydown", onKey); };
  }, [open]);

  if (!container) return null;

  const isSeries = seasons.length > 0 || episodes.length > 0;
  if (!isSeries) return null;

  const released = (ep: TVEpisode) => !ep.air_date || new Date(ep.air_date) <= new Date();
  const epName = episodes.find(e => e.episode_number === selectedEpisode)?.name;
  const dubName = dubs.find(d => d.id === selectedTranslator)?.name;

  const pill = "inline-flex items-center gap-1 sm:gap-1.5 h-7 sm:h-8 px-2.5 sm:px-3 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15 text-white text-[12px] sm:text-[13px] font-semibold hover:bg-black/70 transition-colors cursor-pointer select-none min-w-0 max-w-full";
  // Round arrow buttons flanking the Episode pill — MOBILE ONLY (sm:hidden); the
  // desktop control bar already carries prev/next chevrons.
  const arrowBtn = "sm:hidden inline-flex items-center justify-center h-7 w-7 rounded-full bg-black/60 backdrop-blur-md ring-1 ring-white/15 text-white hover:bg-black/70 transition-colors shrink-0 disabled:opacity-35 disabled:pointer-events-none";
  const hasEpNav = props.onPrev != null || props.onNext != null;
  const menu = "absolute top-[110%] left-0 min-w-[150px] max-h-[52vh] overflow-y-auto rounded-xl bg-black/85 backdrop-blur-xl ring-1 ring-white/12 shadow-2xl shadow-black/60 p-1 z-[2]";
  const row = (active: boolean) =>
    "flex items-center justify-between gap-3 w-full px-3 py-2 rounded-lg text-[13px] text-left transition-colors " +
    (active ? "bg-primary/20 text-primary font-semibold" : "text-white/85 hover:bg-white/10");

  return createPortal(
    <div
      ref={rootRef}
      // `player-ep-bar` (+ is-open) drive auto-hide via globals.css: the bar
      // fades with the player controls (shown on hover / pause, hidden while
      // playing + idle) but stays put while a dropdown is open.
      className={"player-ep-bar absolute top-2 left-2 sm:top-3 sm:left-3 z-[15] flex flex-nowrap items-center gap-1.5 sm:gap-2 max-w-[calc(100%-1rem)]" + (open ? " is-open" : "")}
      // don't let clicks reach the video (play/pause) under the bar
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* SEASON */}
      {seasons.length > 1 && (
        <div className="relative shrink-0">
          <button className={pill} onClick={() => setOpen(open === "season" ? null : "season")}>
            {"Сезон "}{selectedSeason}
            <ChevronDown size={14} className={"transition-transform " + (open === "season" ? "rotate-180" : "")} />
          </button>
          {open === "season" && (
            <div className={menu}>
              {seasons.map(s => (
                <button key={s.season_number} className={row(s.season_number === selectedSeason)}
                  onClick={() => { props.onSeason(s.season_number); setOpen(null); }}>
                  <span>{"Сезон "}{s.season_number}</span>
                  {s.season_number === selectedSeason && <Check size={14} />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Prev EPISODE — mobile only */}
      {hasEpNav && (
        <button className={arrowBtn} disabled={!props.hasPrev} onClick={() => props.onPrev?.()} aria-label="Предыдущая серия">
          <ChevronLeft size={16} />
        </button>
      )}

      {/* EPISODE (desktop prev/next arrows live in the bottom control bar) */}
      <div className="relative min-w-0">
        <button className={pill} onClick={() => setOpen(open === "episode" ? null : "episode")}>
          <span className="truncate">
            {"Серия "}{selectedEpisode}
            <span className="hidden sm:inline">{epName ? " · " + epName : ""}</span>
          </span>
          <ChevronDown size={14} className={"shrink-0 transition-transform " + (open === "episode" ? "rotate-180" : "")} />
        </button>
        {open === "episode" && (
          <div className={menu + " min-w-[240px]"}>
            {episodes.map(ep => {
              const ok = released(ep);
              const active = ep.episode_number === selectedEpisode;
              return (
                <button key={ep.episode_number} disabled={!ok}
                  className={row(active) + (ok ? "" : " opacity-40 cursor-not-allowed")}
                  onClick={() => { if (ok) { props.onEpisode(ep.episode_number); setOpen(null); } }}>
                  <span className="truncate"><span className="text-white/50">{ep.episode_number}.</span> {ep.name || ("Серия " + ep.episode_number)}</span>
                  {active && <Check size={14} className="flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Next EPISODE — mobile only */}
      {hasEpNav && (
        <button className={arrowBtn} disabled={!props.hasNext} onClick={() => props.onNext?.()} aria-label="Следующая серия">
          <ChevronRight size={16} />
        </button>
      )}

      {/* DUB */}
      {dubs.length > 1 && (
        <div className="relative shrink-0">
          <button className={pill} onClick={() => setOpen(open === "dub" ? null : "dub")}>
            <span className="max-w-[38vw] sm:max-w-[200px] truncate">{dubName || "Озвучка"}</span>
            <ChevronDown size={14} className={"transition-transform " + (open === "dub" ? "rotate-180" : "")} />
          </button>
          {open === "dub" && (
            <div className={menu + " min-w-[190px]"}>
              {dubs.map(d => (
                <button key={d.id} className={row(d.id === selectedTranslator)}
                  onClick={() => { props.onDub(d.id); setOpen(null); }}>
                  <span className="truncate">{d.name}</span>
                  {d.id === selectedTranslator && <Check size={14} className="flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>,
    container
  );
}
