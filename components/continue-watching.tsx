"use client";

import { getHistory, type HistoryItem } from "@/lib/storage";
import { getImageUrl, getTVSeasonEpisodes } from "@/lib/tmdb";
import { Play } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState, useEffect } from "react";

function formatTime(s: number) {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`;
}

type ContinueItem = HistoryItem & {
  launchSeason?: number;
  launchEpisode?: number;
  isNextEpisode?: boolean;
  // true when we suggested episode+1 WITHOUT knowing the episode count (old
  // history, no episodeCount stored) — verified against TMDB after render.
  _unverified?: boolean;
};

type NextInfo = { launchSeason: number; launchEpisode: number } | null;

// Where to go after finishing (season, episode), given how many episodes the
// season has and how many seasons exist. null = the series is over (last
// episode of the last season) → don't suggest a nonexistent "next episode".
// Before this bounds check, finishing e.g. episode 8 of 8 suggested episode 9,
// which the backend then resolved to episode 1 (reported: ЮЗЗЗ / Первая ракетка).
function nextFromCounts(season: number, episode: number, epCount?: number, seasonCount?: number): NextInfo {
  if (epCount != null && epCount > 0) {
    if (episode < epCount) return { launchSeason: season, launchEpisode: episode + 1 };
    if (seasonCount != null && season < seasonCount) return { launchSeason: season + 1, launchEpisode: 1 };
    return null;
  }
  // Count unknown (old history) — optimistic next, corrected async in verify().
  return { launchSeason: season, launchEpisode: episode + 1 };
}

function buildContinueItems(history: HistoryItem[]): ContinueItem[] {
  const items: ContinueItem[] = [];
  const seenShows = new Set<string>();

  // History is ordered by recency (latest first)
  for (const h of history) {
    if (h.duration <= 0) continue;
    const key = `${h.type}-${h.id}`;
    if (seenShows.has(key)) continue;
    seenShows.add(key);

    const ratio = h.progress / h.duration;
    const isFinished = ratio >= 0.95;

    if (h.type === "movie") {
      if (!isFinished && h.progress > 30) items.push({ ...h });
    } else {
      // TV series
      if (!isFinished && h.progress > 30) {
        items.push({ ...h, launchSeason: h.season, launchEpisode: h.episode });
      } else if (isFinished && h.season && h.episode) {
        const next = nextFromCounts(h.season, h.episode, h.episodeCount, h.seasonCount);
        if (next === null) continue; // series finished — don't show a bogus next episode
        items.push({
          ...h,
          launchSeason: next.launchSeason,
          launchEpisode: next.launchEpisode,
          isNextEpisode: true,
          _unverified: h.episodeCount == null,
        });
      }
    }
  }
  return items.slice(0, 12);
}

// For items suggested from OLD history (no stored episodeCount), confirm the
// next episode actually exists via TMDB (cached); correct to next season, or
// drop the card if the series is over.
async function verifyNextEpisodes(base: ContinueItem[]): Promise<ContinueItem[]> {
  const toCheck = base.filter(i => i._unverified && i.type === "tv" && i.season && i.episode);
  if (!toCheck.length) return base;
  const fix = new Map<string, NextInfo | "keep">();
  await Promise.all(toCheck.map(async (i) => {
    const season = i.season!, episode = i.episode!;
    const eps = await getTVSeasonEpisodes(i.id, season);
    if (!eps.length) { fix.set(`${i.type}-${i.id}`, "keep"); return; } // fetch failed — keep optimistic
    let next: NextInfo;
    if (episode < eps.length) next = { launchSeason: season, launchEpisode: episode + 1 };
    else {
      const nextSeason = await getTVSeasonEpisodes(i.id, season + 1);
      next = nextSeason.length ? { launchSeason: season + 1, launchEpisode: 1 } : null;
    }
    fix.set(`${i.type}-${i.id}`, next);
  }));
  return base
    .map(it => {
      if (!it._unverified) return it;
      const c = fix.get(`${it.type}-${it.id}`);
      if (c === undefined || c === "keep") return { ...it, _unverified: false };
      if (c === null) return null; // series over → remove card
      return { ...it, launchSeason: c.launchSeason, launchEpisode: c.launchEpisode, _unverified: false };
    })
    .filter(Boolean) as ContinueItem[];
}

export function ContinueWatching() {
  const [items, setItems] = useState<ContinueItem[]>([]);

  useEffect(() => {
    let alive = true;
    const refresh = () => {
      const base = buildContinueItems(getHistory());
      setItems(base);
      verifyNextEpisodes(base).then(v => { if (alive) setItems(v); }).catch(() => {});
    };
    refresh();
    window.addEventListener("sync-complete", refresh);
    return () => { alive = false; window.removeEventListener("sync-complete", refresh); };
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold text-foreground">{"\u041f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440"}</h2>
          <div className="h-1 w-16 bg-primary rounded mt-2" />
        </div>
        <Link href="/history" className="text-sm text-muted-foreground hover:text-primary transition-colors">
          {"\u0412\u0441\u044f \u0438\u0441\u0442\u043e\u0440\u0438\u044f \u2192"}
        </Link>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {items.map((item, idx) => {
          const progress = item.isNextEpisode ? 0 : (item.progress / item.duration) * 100;
          const showSeason = item.launchSeason ?? item.season;
          const showEpisode = item.launchEpisode ?? item.episode;
          const baseHref = item.type === "tv" ? `/tv/${item.id}` : `/movie/${item.id}`;
          const href = item.type === "tv" && showSeason && showEpisode
            ? `${baseHref}?s=${showSeason}&e=${showEpisode}`
            : baseHref;
          return (
            <Link key={`${item.type}-${item.id}-${idx}`} href={href}>
              <div className="group cursor-pointer h-full">
                {/* Outer frosted-glass frame */}
                <div className="rounded-[15px] p-[1.5px] bg-gradient-to-br from-white/20 via-white/[0.06] to-white/[0.02] shadow-lg shadow-black/20 transition-shadow duration-300 group-hover:shadow-2xl group-hover:shadow-black/60">
                  {/* Inner glass layer */}
                  <div className="rounded-[14px] p-[1px] bg-gradient-to-br from-white/[0.04] to-transparent backdrop-blur-sm">
                <div className="relative overflow-hidden rounded-[13px] aspect-[2/3] bg-card transition-all duration-300 group-hover:ring-2 group-hover:ring-primary/30">
                  <Image
                    src={getImageUrl(item.poster_path, "w500") || "/placeholder.svg"}
                    alt={item.title}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                    sizes="(max-width: 768px) 50vw, 240px"
                  />

                  {/* Bottom gradient so time + progress bar read clean */}
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

                  {/* Episode badge \u2014 pill, top-left */}
                  {item.type === "tv" && showSeason && showEpisode && (
                    <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-md ring-1 ring-white/15 text-white text-[10px] font-bold tracking-wide">
                      S{showSeason}E{showEpisode}
                    </div>
                  )}

                  {/* Next-episode badge replaces the time when applicable */}
                  {item.isNextEpisode ? (
                    <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-primary text-primary-foreground text-[10px] font-extrabold tracking-wide shadow-md shadow-black/30">
                      {"\u0421\u041b\u0415\u0414."}
                    </div>
                  ) : (
                    <div className="absolute bottom-3 right-3 text-white text-[12px] font-semibold tracking-wide drop-shadow-[0_2px_4px_rgba(0,0,0,0.6)]">
                      {formatTime(item.duration - item.progress)}
                    </div>
                  )}

                  {/* Play overlay on hover */}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-2xl shadow-primary/40 ring-2 ring-white/20 transition-transform duration-300 group-hover:scale-105">
                      <Play size={24} className="text-primary-foreground ml-0.5" fill="currentColor" />
                    </div>
                  </div>

                  {/* Progress bar at the bottom \u2014 thicker, soft track, vivid fill */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-white/10">
                    <div
                      className="h-full bg-primary rounded-r-full shadow-[0_0_10px_rgba(163,230,53,0.45)]"
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                  </div>
                </div>
                  </div>
                </div>
                <div className="mt-3 px-0.5">
                  <h3 className="text-foreground text-[14px] font-semibold tracking-tight line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-foreground/55 text-[12px] mt-0.5">
                    {item.isNextEpisode
                      ? `\u041d\u0430\u0447\u0430\u0442\u044c S${showSeason}E${showEpisode}`
                      : item.type === "tv" && showSeason && showEpisode
                      ? `\u0421\u0435\u0437\u043e\u043d ${showSeason}, \u0421\u0435\u0440\u0438\u044f ${showEpisode}`
                      : formatTime(item.progress) + " \u043f\u0440\u043e\u0441\u043c\u043e\u0442\u0440\u0435\u043d\u043e"}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
