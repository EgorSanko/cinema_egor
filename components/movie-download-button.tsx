"use client";

import { useEffect, useRef, useState } from "react";
import { Download, Check, X, ChevronDown, Loader2 } from "lucide-react";
import { addDownload, hasDownloaded, buildFilename, triggerBrowserDownload } from "@/lib/downloads";
import { useAuthGate } from "./auth-gate";

interface MovieMeta {
  id: number;
  title: string;
  poster_path: string | null;
  release_date?: string;
  /** Runtime in minutes — used to estimate file size. */
  runtime?: number;
}

interface TVMeta {
  id: number;
  name: string;
  poster_path: string | null;
  first_air_date?: string;
  number_of_seasons: number;
}

interface MovieDownloadProps {
  type: "movie";
  movie: MovieMeta;
}
interface TVDownloadProps {
  type: "tv";
  show: TVMeta;
  initialSeason?: number;
  initialEpisode?: number;
}
type Props = MovieDownloadProps | TVDownloadProps;

const BYTES_PER_SEC: Record<string, number> = {
  "360p": 70_000,    // ~0.5 Mbps
  "480p": 130_000,   // ~1 Mbps
  "720p": 230_000,   // ~1.8 Mbps
  "1080p": 400_000,  // ~3.2 Mbps
  "1440p": 800_000,  // ~6.4 Mbps
  "2160p": 1_500_000, // ~12 Mbps
  "4k": 1_500_000,
};
function fmtSize(quality: string, durationSec?: number): string {
  if (!durationSec) return "";
  const bps = BYTES_PER_SEC[quality.toLowerCase()] ?? 1_000_000;
  const bytes = durationSec * bps;
  if (bytes > 1024 ** 3) return `~${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `~${Math.round(bytes / 1024 ** 2)} MB`;
}

export function MovieDownloadButton(props: Props) {
  const requireAuth = useAuthGate();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [streams, setStreams] = useState<Record<string, string> | null>(null);
  const [duration, setDuration] = useState<number | undefined>();
  const [season, setSeason] = useState<number>(
    props.type === "tv" ? props.initialSeason ?? 1 : 1
  );
  const [episode, setEpisode] = useState<number>(
    props.type === "tv" ? props.initialEpisode ?? 1 : 1
  );
  const popupRef = useRef<HTMLDivElement>(null);
  const id = props.type === "movie" ? props.movie.id : props.show.id;
  const targetSeason = props.type === "tv" ? season : undefined;
  const targetEpisode = props.type === "tv" ? episode : undefined;
  const [downloadedAny, setDownloadedAny] = useState<ReturnType<typeof hasDownloaded>>(null);

  // Reflect downloads from other tabs / sync events
  useEffect(() => {
    const refresh = () => setDownloadedAny(hasDownloaded(id, props.type));
    refresh();
    window.addEventListener("downloads-changed", refresh);
    window.addEventListener("sync-complete", refresh);
    return () => {
      window.removeEventListener("downloads-changed", refresh);
      window.removeEventListener("sync-complete", refresh);
    };
  }, [id, props.type]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const fetchStreamsForCurrent = async () => {
    setLoading(true);
    setError(null);
    setStreams(null);
    try {
      const m: any = props.type === "movie" ? props.movie : props.show;
      const title = props.type === "movie" ? m.title : m.name;
      const date = props.type === "movie" ? m.release_date : m.first_air_date;
      const year = date ? new Date(date).getFullYear() : "";
      const q = encodeURIComponent((title || "").replace(/["«»""]/g, "").trim());
      const url = props.type === "movie"
        ? `/hdrezka/api/search?q=${q}&year=${year}&type=movie`
        : `/hdrezka/api/search?q=${q}&year=${year}&type=tv&season=${season}&episode=${episode}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.streams || Object.keys(data.streams).length === 0) {
        setError("Не удалось получить файлы. Возможно эпизод ещё не вышел.");
        return;
      }
      setStreams(data.streams);
      // Prefer real runtime when known. Movies pass runtime in minutes,
      // TV episodes vary widely so we use a 25-min fallback (sitcom-ish);
      // estimate is just to nudge "1080p is bigger than 360p" awareness.
      const fallbackSec = props.type === "movie"
        ? ((props.movie.runtime || 90) * 60)
        : 1500;
      setDuration(fallbackSec);
    } catch {
      setError("Ошибка сети, попробуйте ещё раз");
    } finally {
      setLoading(false);
    }
  };

  const openMenu = () => {
    if (!requireAuth("Войдите, чтобы скачивать фильмы и сериалы")) return;
    setOpen(true);
    if (!streams) fetchStreamsForCurrent();
  };

  useEffect(() => {
    if (open && props.type === "tv") fetchStreamsForCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, episode]);

  const startDownload = (quality: string, url: string) => {
    const m: any = props.type === "movie" ? props.movie : props.show;
    const title = props.type === "movie" ? m.title : m.name;
    const entry: Parameters<typeof addDownload>[0] = props.type === "movie"
      ? {
          id, type: "movie", title, poster_path: m.poster_path,
          release_date: m.release_date,
          quality, url,
        }
      : {
          id, type: "tv", title, poster_path: m.poster_path,
          first_air_date: m.first_air_date,
          season, episode, quality, url,
        };
    addDownload(entry);
    triggerBrowserDownload(url, buildFilename(entry));
    setDownloadedAny(hasDownloaded(id, props.type));
  };

  return (
    <div className="relative inline-block">
      <button
        onClick={openMenu}
        className="inline-flex items-center gap-2 h-10 px-4 rounded-full bg-foreground/[0.06] ring-1 ring-white/[0.08] text-foreground/85 hover:bg-foreground/[0.1] transition-colors text-[13px] font-medium"
        title={downloadedAny ? `Уже скачано в ${downloadedAny.quality}` : "Скачать файл"}
      >
        {downloadedAny ? <Check size={15} className="text-primary" /> : <Download size={15} />}
        Скачать
        <ChevronDown size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div
          ref={popupRef}
          className="absolute top-full mt-2 right-0 z-50 w-[280px] sm:w-[320px] rounded-2xl bg-black/95 backdrop-blur-md ring-1 ring-white/15 shadow-2xl p-4"
          style={{ boxShadow: "0 12px 40px -6px rgba(0,0,0,0.7)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white text-[13px] font-bold uppercase tracking-wider">Скачать</h3>
            <button onClick={() => setOpen(false)} className="text-white/50 hover:text-white" aria-label="Закрыть">
              <X size={16} />
            </button>
          </div>

          {props.type === "tv" && (
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">Сезон</label>
                <select
                  value={season}
                  onChange={(e) => setSeason(Number(e.target.value))}
                  className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/[0.08] text-white text-[13px] focus:outline-none"
                >
                  {Array.from({ length: props.show.number_of_seasons || 1 }, (_, i) => i + 1).map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">Серия</label>
                <input
                  type="number"
                  min={1}
                  max={99}
                  value={episode}
                  onChange={(e) => setEpisode(Math.max(1, Math.min(99, Number(e.target.value) || 1)))}
                  className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/[0.08] text-white text-[13px] focus:outline-none"
                />
              </div>
            </div>
          )}

          {loading && (
            <div className="flex items-center justify-center gap-2 py-6 text-white/50 text-[13px]">
              <Loader2 size={16} className="animate-spin" /> Получаем ссылки...
            </div>
          )}

          {error && (
            <div className="px-3 py-2 rounded-md bg-red-500/15 text-red-300 text-[12px]">{error}</div>
          )}

          {streams && !loading && (
            <div className="space-y-1.5">
              {Object.entries(streams)
                .sort(([a], [b]) => parseInt(b) - parseInt(a))
                .map(([quality, url]) => {
                  const sizeStr = fmtSize(quality, duration);
                  const already = hasDownloaded(id, props.type, targetSeason, targetEpisode);
                  const alreadyThisQuality = already?.quality === quality;
                  return (
                    <button
                      key={quality}
                      onClick={() => startDownload(quality, url as string)}
                      className="w-full flex items-center justify-between gap-3 px-3 h-10 rounded-lg bg-white/[0.05] hover:bg-primary/15 hover:ring-1 hover:ring-primary/30 transition-colors text-[13px] text-left"
                    >
                      <span className="flex items-center gap-2 text-white font-semibold">
                        {alreadyThisQuality && <Check size={13} className="text-primary" />}
                        {quality}
                      </span>
                      {sizeStr && <span className="text-white/50 text-[11.5px]">{sizeStr}</span>}
                    </button>
                  );
                })}
            </div>
          )}

          <p className="mt-3 text-[10.5px] text-white/40 leading-snug">
            Ссылки действительны ~24ч — качай в день клика. История доступна в разделе «Загрузки».
          </p>
        </div>
      )}
    </div>
  );
}
