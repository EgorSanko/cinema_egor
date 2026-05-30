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
  /** TMDB returns `seasons: [{season_number, episode_count}]`. Pass it so
   *  the Series dropdown can render the exact list of episodes per season
   *  (otherwise we'd guess 1..20 or force a free-form number input). */
  seasons?: Array<{ season_number: number; episode_count: number }>;
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

interface Translator { id: number; name: string; is_premium?: boolean }

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
  // Translators are loaded from the same /hdrezka/api/search call. Default
  // selected = whatever the backend reports as active for the request.
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
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

  const fetchStreamsForCurrent = async (overrideTr?: number | null) => {
    setLoading(true);
    setError(null);
    setStreams(null);
    try {
      const m: any = props.type === "movie" ? props.movie : props.show;
      const title = props.type === "movie" ? m.title : m.name;
      const date = props.type === "movie" ? m.release_date : m.first_air_date;
      const year = date ? new Date(date).getFullYear() : "";
      const q = encodeURIComponent((title || "").replace(/["«»""]/g, "").trim());
      const tr = overrideTr ?? selectedTranslator;
      const trParam = tr ? `&translator_id=${tr}` : "";
      const url = props.type === "movie"
        ? `/hdrezka/api/search?q=${q}&year=${year}&type=movie${trParam}`
        : `/hdrezka/api/search?q=${q}&year=${year}&type=tv&season=${season}&episode=${episode}${trParam}`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.streams || Object.keys(data.streams).length === 0) {
        setError("Не удалось получить файлы. Возможно эпизод ещё не вышел.");
        return;
      }
      setStreams(data.streams);
      // Capture translators list on first fetch; respect backend's reported
      // active_translator_id when user hasn't picked anything yet.
      if (Array.isArray(data.translators) && data.translators.length > 0) {
        setTranslators(data.translators);
        if (selectedTranslator == null) {
          setSelectedTranslator(data.active_translator_id ?? data.translators[0].id);
        }
      }
      // Real runtime where known. Movies pass it in minutes; TV episodes
      // vary so we default to 25 min as a sitcom-ish fallback.
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

  // Re-fetch streams when the user changes season/episode (TV) or the
  // translator (both kinds). selectedTranslator is set automatically on
  // first fetch, so we skip the very first run.
  useEffect(() => {
    if (open && props.type === "tv") fetchStreamsForCurrent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, episode]);
  useEffect(() => {
    if (open && selectedTranslator != null && streams) fetchStreamsForCurrent(selectedTranslator);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTranslator]);

  const startDownload = (quality: string, url: string) => {
    const m: any = props.type === "movie" ? props.movie : props.show;
    const title = props.type === "movie" ? m.title : m.name;
    const trName = translators.find(t => t.id === selectedTranslator)?.name;
    const entry: Parameters<typeof addDownload>[0] = props.type === "movie"
      ? {
          id, type: "movie", title, poster_path: m.poster_path,
          release_date: m.release_date,
          quality, url,
          translatorName: trName,
        }
      : {
          id, type: "tv", title, poster_path: m.poster_path,
          first_air_date: m.first_air_date,
          season, episode, quality, url,
          translatorName: trName,
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

          {props.type === "tv" && (() => {
            // Episode count for currently-selected season. Falls back to 20
            // if TMDB didn't send a count (unknown future seasons).
            const seasonInfo = props.show.seasons?.find(s => s.season_number === season);
            const epCount = Math.max(1, seasonInfo?.episode_count || 20);
            return (
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">Сезон</label>
                  <select
                    value={season}
                    onChange={(e) => {
                      const next = Number(e.target.value);
                      setSeason(next);
                      // Reset episode to 1 when switching seasons so we don't
                      // get stuck on an episode that doesn't exist in the new one.
                      setEpisode(1);
                    }}
                    className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/[0.08] text-white text-[13px] focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {Array.from({ length: props.show.number_of_seasons || 1 }, (_, i) => i + 1).map(s => (
                      <option key={s} value={s} style={{ backgroundColor: "#18181b", color: "#fff" }}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">Серия</label>
                  <select
                    value={episode}
                    onChange={(e) => setEpisode(Number(e.target.value))}
                    className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/[0.08] text-white text-[13px] focus:outline-none"
                    style={{ colorScheme: "dark" }}
                  >
                    {Array.from({ length: epCount }, (_, i) => i + 1).map(e => (
                      <option key={e} value={e} style={{ backgroundColor: "#18181b", color: "#fff" }}>{e}</option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })()}

          {/* Translator picker — shown once we know the available dubs. Dedupe
              by id since HDRezka sometimes returns duplicates. */}
          {translators.length > 1 && (
            <div className="mb-3">
              <label className="text-[10px] uppercase tracking-wider text-white/45 font-semibold">Озвучка</label>
              <select
                value={selectedTranslator ?? ""}
                onChange={(e) => setSelectedTranslator(Number(e.target.value))}
                className="w-full mt-1 px-2 py-1.5 rounded-md bg-white/[0.08] text-white text-[13px] focus:outline-none"
              >
                {Array.from(new Map(translators.map(t => [t.id, t])).values()).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.is_premium ? " (Premium)" : ""}
                  </option>
                ))}
              </select>
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
