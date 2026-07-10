"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronLeft, ChevronRight, Check } from "lucide-react";
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
  onNextEpisode: () => void;
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
  const relEps = episodes.filter(released);
  const curIdx = relEps.findIndex(e => e.episode_number === selectedEpisode);
  const epName = episodes.find(e => e.episode_number === selectedEpisode)?.name;
  const dubName = dubs.find(d => d.id === selectedTranslator)?.name;
  const hasPrev = curIdx > 0;
  const hasNext = (curIdx >= 0 && curIdx < relEps.length - 1) || seasons.some(s => s.season_number > selectedSeason);

  const prevEpisode = () => { if (hasPrev) props.onEpisode(relEps[curIdx - 1].episode_number); };

  const pill = "inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 text-white text-[13px] font-semibold hover:bg-black/70 transition-colors cursor-pointer select-none";
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
      className={"player-ep-bar absolute top-3 left-3 z-[15] flex flex-wrap items-center gap-2" + (open ? " is-open" : "")}
      // don't let clicks reach the video (play/pause) under the bar
      onPointerDown={(e) => e.stopPropagation()}
    >
      {/* SEASON */}
      {seasons.length > 1 && (
        <div className="relative">
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

      {/* EPISODE — prev  [Серия N ▾]  next */}
      <div className="flex items-center gap-1">
        <button
          className={"grid place-items-center h-8 w-8 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 text-white transition-colors " + (hasPrev ? "hover:bg-black/70" : "opacity-35 cursor-not-allowed")}
          onClick={prevEpisode} disabled={!hasPrev} aria-label="Предыдущая серия">
          <ChevronLeft size={17} />
        </button>
        <div className="relative">
          <button className={pill} onClick={() => setOpen(open === "episode" ? null : "episode")}>
            <span className="max-w-[42vw] sm:max-w-[280px] truncate">
              {"Серия "}{selectedEpisode}{epName ? " · " + epName : ""}
            </span>
            <ChevronDown size={14} className={"transition-transform " + (open === "episode" ? "rotate-180" : "")} />
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
        <button
          className={"grid place-items-center h-8 w-8 rounded-full bg-black/55 backdrop-blur-md ring-1 ring-white/15 text-white transition-colors " + (hasNext ? "hover:bg-black/70" : "opacity-35 cursor-not-allowed")}
          onClick={() => hasNext && props.onNextEpisode()} disabled={!hasNext} aria-label="Следующая серия">
          <ChevronRight size={17} />
        </button>
      </div>

      {/* DUB */}
      {dubs.length > 1 && (
        <div className="relative">
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
