"use client";

import { useEffect, useState } from "react";
import { Bookmark, Eye, Play, Check } from "lucide-react";
import { getStatus, setStatus, type WatchStatus } from "@/lib/status";

interface Props {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path: string | null;
  vote_average?: number;
  size?: "sm" | "md";
}

/** 3-button row: Хочу / Смотрю (TV) / Просмотрел.
    Clicking same status again clears it (toggle off). */
export function StatusButtons({ id, type, title, poster_path, vote_average, size = "md" }: Props) {
  const [current, setCurrent] = useState<WatchStatus | null>(null);

  useEffect(() => {
    setCurrent(getStatus(type, id));
    const refresh = () => setCurrent(getStatus(type, id));
    window.addEventListener("status-changed", refresh);
    return () => window.removeEventListener("status-changed", refresh);
  }, [type, id]);

  const toggle = (s: WatchStatus) => {
    const next = current === s ? null : s;
    setStatus(type, id, next, { title, poster_path, vote_average });
    setCurrent(next);
  };

  const buttons: { s: WatchStatus; label: string; icon: React.ReactNode; show: boolean }[] = [
    { s: "want",     label: "Хочу",       icon: <Bookmark size={size === "sm" ? 13 : 15} fill={current === "want" ? "currentColor" : "none"} />, show: true },
    { s: "watching", label: "Смотрю",     icon: <Play size={size === "sm" ? 12 : 14} fill={current === "watching" ? "currentColor" : "none"} />, show: type === "tv" },
    { s: "watched",  label: "Просмотрел", icon: <Check size={size === "sm" ? 14 : 16} />, show: true },
  ];

  const h = size === "sm" ? "h-8" : "h-10";
  const tx = size === "sm" ? "text-[11.5px]" : "text-[13px]";

  return (
    <div className={`inline-flex items-center rounded-full bg-foreground/[0.04] ring-1 ring-white/[0.06] p-0.5 ${h}`}>
      {buttons.filter(b => b.show).map(b => {
        const active = current === b.s;
        return (
          <button
            key={b.s}
            onClick={() => toggle(b.s)}
            className={`inline-flex items-center gap-1.5 px-3 rounded-full font-medium transition-all ${tx} ${
              active
                ? "bg-primary text-primary-foreground"
                : "text-foreground/65 hover:text-foreground hover:bg-foreground/[0.04]"
            }`}
            style={active ? { boxShadow: "0 2px 12px -2px rgba(163,230,53,0.5)" } : undefined}
            title={b.label}
          >
            {b.icon}
            <span>{b.label}</span>
          </button>
        );
      })}
    </div>
  );
}
