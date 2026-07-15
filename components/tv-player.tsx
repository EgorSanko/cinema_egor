"use client";
import { MovieDownloadButton } from './movie-download-button';

import type { TVShowDetails } from "@/lib/tmdb";
import {
  Play, Film, ChevronDown, Mic, Users, Tv as TvIcon, Subtitles, Settings, MoreHorizontal,
  ChevronLeft, ChevronRight, Maximize, SkipForward, Heart, Plus,
} from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useRef, useEffect, useCallback } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { StatusButtons } from "./status-buttons";
import { ExpandableText } from "./expandable-text";
import { TrailerButton } from "./trailer-modal";
import { useAuthGate } from "./auth-gate";
import { SkipOverlays } from "./skip-overlays";
import { PlayerEpisodeBar } from "./player-episode-bar";
import { ProUpsell } from "./pro-upsell";
import { PlayerSwitcher } from "./player-switcher";
import { PreRollAd } from "./pre-roll-ad";
import { useSubscription } from "@/hooks/use-subscription";

// Пре-ролл реклама для free-тарифа (nginx-статика, вне Next).
const AD_URL = "/ads/amnyam.mp4";
// Мид-ролл: iframe Alloha кроссдоменный — переключение серий ВНУТРИ него не
// детектится (нет postMessage/onload/смены src). Поэтому крутим рекламу по
// таймеру: раз в N минут просмотра снова показываем пре-ролл, чтобы бинж без
// рекламы был невозможен независимо от навигации внутри плеера. Тюнить тут.
const AD_MIDROLL_MS = 20 * 60 * 1000; // 20 минут
import { savePosition, getPosition, addToHistory, saveLastEpisode, getLastEpisode, saveLastTranslator, getLastTranslator, recordTranslatorTry } from "@/lib/storage";
import { watchHeartbeat } from "@/lib/metrika";
import { getSource, resolveKinopub, resolveZenithEmbed, resolveIframeEmbed, isIframeSource } from "@/lib/kinopub";
import { pickDefaultQuality, setQualityPref } from "@/lib/quality";
import { hlsProxyUrl } from "@/lib/quality-probe";
import { warmStream } from "@/lib/stream-warm";
import { ArtPlayerView, type ArtSubtitle } from "./art-player";

interface TVPlayerProps {
  show: TVShowDetails;
}

interface Episode {
  id: number;
  name: string;
  episode_number: number;
  season_number: number;
  air_date: string;
  overview: string;
  still_path: string | null;
  runtime: number;
  vote_average: number;
}

interface Translator {
  id: number;
  name: string;
  is_premium?: boolean;
}

export function TVPlayer({ show }: TVPlayerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const requireAuth = useAuthGate();
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoadingMascot, setShowLoadingMascot] = useState(false);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState<any>(null);
  // Position to start the next source switch at (set on a quality switch).
  const [seekOnSwitch, setSeekOnSwitch] = useState<number | undefined>(undefined);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loadingEpisodes, setLoadingEpisodes] = useState(false);
  const [showSeasons, setShowSeasons] = useState(false);
  const [showEpisodes, setShowEpisodes] = useState(false);
  // На zenithjs (не наш плеер) наш список серий прячем — навигация только внутри
  // их iframe, чтобы не было рассинхрона (мы не видим внутренние смены серии).
  const [srcIsZenith, setSrcIsZenith] = useState(true); // free по умолчанию → без флеша списка серий
  // Реальный фри = только zenithjs; Alloha (тоже iframe) — Про-источник, апселл не показываем.
  const [srcIsFree, setSrcIsFree] = useState(true);
  // Тариф: free → плеер Alloha + пре-ролл; Pro → без рекламы.
  const { isPro, loading: subLoading } = useSubscription();
  const isProRef = useRef(isPro);
  useEffect(() => { isProRef.current = isPro; }, [isPro]);
  // Реклама показана/пропущена в этой сессии страницы (гейтит контент-iframe).
  const [adDone, setAdDone] = useState(false);
  // Мид-ролл по таймеру (см. AD_MIDROLL_MS): раз в N минут просмотра снова
  // показываем рекламу — бинж без рекламы невозможен даже при навигации серий
  // внутри кроссдоменного плеера Alloha (которую мы не видим).
  useEffect(() => {
    if (isPro || subLoading || !showPlayer || !adDone) return;
    const t = setTimeout(() => setAdDone(false), AD_MIDROLL_MS);
    return () => clearTimeout(t);
  }, [isPro, subLoading, showPlayer, adDone]);
  useEffect(() => {
    const check = () => { setSrcIsZenith(isIframeSource()); setSrcIsFree(getSource() === "zenithjs"); };
    check();
    // Источник сменился (энфорсер free→alloha / переключатель), просмотр не начат
    // → пере-резолвим embed под новый источник (free реально попадает на Alloha).
    const onSourceChange = () => {
      check();
      if (!startedRef.current && isIframeSource()) {
        setStreamData(null);
        resolveIframeEmbed(show.id, "tv", selectedSeason, selectedEpisode, { allohaFallbackToZenith: !isProRef.current })
          .then((embed) => { if (embed && !startedRef.current) setStreamData({ collaps: true, collapsEmbed: embed }); });
      }
    };
    window.addEventListener("kino-source-changed", onSourceChange);
    window.addEventListener("storage", check);
    return () => { window.removeEventListener("kino-source-changed", onSourceChange); window.removeEventListener("storage", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, selectedSeason, selectedEpisode]);
  // Новая серия → снова пре-ролл для free (иначе переключение серий было бы
  // обходом рекламы). Для Pro adDone ни на что не влияет — рекламу не показываем.
  useEffect(() => { setAdDone(false); }, [selectedSeason, selectedEpisode]);
  const [cssFullscreen, setCssFullscreen] = useState(false);
  // ArtPlayer container — once captured, SkipOverlays portals into it so
  // they stay visible in every fullscreen mode (web/native/mobile).
  const [playerContainer, setPlayerContainer] = useState<HTMLElement | null>(null);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);
  // "Смотреть" / автопереход на след. серию стартуют с 0; только "Продолжить
  // просмотр" перематывает на сохранённую позицию (wantResume gate).
  const [wantResume, setWantResume] = useState(false);
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [showTranslators, setShowTranslators] = useState(false);
  const [translatorLoading, setTranslatorLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<ArtSubtitle[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  // HDRezka-style availability: which seasons/episodes the SELECTED dub actually
  // has ({season: [episodeNumbers]}). Lets us scope the season/episode selectors
  // to the chosen dub so an invalid (dub, season) combo can't be picked. null =
  // not loaded yet → fall back to showing the full TMDB structure.
  const [availTree, setAvailTree] = useState<Record<number, number[]> | null>(null);
  // Which dubs have the CURRENTLY-selected (season, episode). Used to filter the
  // IN-PLAYER dub switcher so it only offers voiceovers that translated this
  // episode. null = not loaded → show all dubs.
  const [episodeDubIds, setEpisodeDubIds] = useState<number[] | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInterval = useRef<any>(null);
  const translatorRef = useRef<HTMLDivElement>(null);
  const availKeyRef = useRef<string>("");
  const eptrKeyRef = useRef<string>("");
  // Sticky set of dub ids shown for the CURRENT (url|season|episode). It only
  // ever grows within an episode, so switching a dub can never make a
  // previously-visible one vanish (reported: "поменял озвучку — прежняя
  // пропала и не возвращается"). Reset when the episode key changes.
  const dubUnionRef = useRef<{ key: string; ids: Set<number> }>({ key: "", ids: new Set() });
  const autoplayTriggeredRef = useRef(false);
  // Wall-clock of the last auto-advance. A real episode can't end within
  // seconds of the previous one starting, so any "episode ended" signal that
  // arrives inside this cooldown is a stale near-end reading from the HLS
  // source swap — ignore it. This is the hard backstop against the
  // skip-2-3-episodes-forward chain (currentTime<5 release was too racy).
  const lastAdvanceAtRef = useRef(0);
  const ADVANCE_COOLDOWN_MS = 15000;
  const subsFetchedKeyRef = useRef<string>("");
  // Warmed HDRezka resolve for the initial episode — makes "Смотреть" instant.
  const prefetchRef = useRef<{ url: string; promise: Promise<any> } | null>(null);
  // True once the user pressed play — gates the async pre-warm probe from
  // clobbering the stream the click already started resolving.
  const startedRef = useRef(false);
  // Tiers found fast on THIS viewer's route by the probe. Reused by the
  // cold-click fetchStream + episode switches (a series' tiers sit on the same
  // edges, so the route's throttle pattern carries across episodes).

  const validSeasons = show.seasons?.filter(s => s.season_number > 0) || [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (translatorRef.current && !translatorRef.current.contains(e.target as Node)) {
        setShowTranslators(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    // Restore last used translator for this show
    const lastTr = getLastTranslator(show.id, "tv");
    if (lastTr) setSelectedTranslator(lastTr.id);

    // Query params override saved last-episode (e.g. from "Continue Watching" card)
    const params = new URLSearchParams(window.location.search);
    const qs = params.get("s");
    const qe = params.get("e");
    if (qs && qe) {
      // From Continue Watching: pre-select correct season/episode but DO NOT auto-play.
      // User clicks the big "Смотреть" overlay themselves.
      setSelectedSeason(parseInt(qs, 10));
      setSelectedEpisode(parseInt(qe, 10));
      return;
    }
    const last = getLastEpisode(show.id);
    if (last) {
      setSelectedSeason(last.season);
      setSelectedEpisode(last.episode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id]);

  useEffect(() => {
    const pos = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
    if (pos && pos.time > 10) {
      setResumeTime(pos.time);
    } else {
      setResumeTime(null);
    }
    // Switching episode (incl. auto-next) starts from 0 — only an explicit
    // "Продолжить" re-arms the seek.
    setWantResume(false);
  }, [show.id, selectedSeason, selectedEpisode]);

  // Live context for the save interval. Without these refs the interval
  // (set once via onVideoReady → startSaving) keeps writing history with
  // the FIRST episode's season/episode/quality/translator. Auto-next chain
  // (E1 → E2 → E3) silently piles all progress onto the E1 row, so the
  // user sees only E1 in history even though they watched 6 episodes.
  const ctxRef = useRef({
    season: selectedSeason,
    episode: selectedEpisode,
    quality: selectedQuality,
    translatorId: selectedTranslator,
    episodes,
    translators,
  });
  useEffect(() => {
    ctxRef.current = {
      season: selectedSeason,
      episode: selectedEpisode,
      quality: selectedQuality,
      translatorId: selectedTranslator,
      episodes,
      translators,
    };
  }, [selectedSeason, selectedEpisode, selectedQuality, selectedTranslator, episodes, translators]);

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          const ctx = ctxRef.current;
          watchHeartbeat();
          savePosition(show.id, "tv", ct, dur, ctx.season, ctx.episode);
          saveLastEpisode(show.id, ctx.season, ctx.episode);
          const epName = ctx.episodes.find(e => e.episode_number === ctx.episode)?.name || "";
          const trName = ctx.translators.find(t => t.id === ctx.translatorId)?.name || "";
          addToHistory({
            id: show.id, type: "tv", title: show.name,
            poster_path: show.poster_path, vote_average: show.vote_average,
            first_air_date: show.first_air_date, watchedAt: Date.now(),
            progress: ct, duration: dur, season: ctx.season,
            episode: ctx.episode, episodeName: epName, quality: ctx.quality,
            translatorName: trName, translatorId: ctx.translatorId || undefined,
            genre_ids: show.genres?.map(g => g.id),
            episodeCount: show.seasons?.find(s => s.season_number === ctx.season)?.episode_count,
            seasonCount: show.seasons?.filter(s => s.season_number > 0).length,
          });
        }
      }
    }, 5000);
  }, [show]);

  useEffect(() => {
    return () => { if (saveInterval.current) clearInterval(saveInterval.current); };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current) {
        savePosition(show.id, "tv", videoRef.current.currentTime, videoRef.current.duration, selectedSeason, selectedEpisode);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [show.id, selectedSeason, selectedEpisode]);

  // iframe-источники (Alloha/Collaps/zenithjs) — их плеер чёрный ящик. Оцениваем
  // просмотр по реальному времени, что iframe открыт, и пишем историю+позицию
  // ЭТОЙ серии → попадает в «продолжить смотреть», считаются часы. Точную
  // докрутку/навигацию серий держит сам их плеер.
  useEffect(() => {
    if (!showPlayer || !streamData?.collapsEmbed) return;
    const durSec = ((show as any)?.episode_run_time?.[0] > 0 ? (show as any).episode_run_time[0] : 45) * 60;
    const startedAt = Date.now();
    const write = () => {
      const elapsed = Math.min((Date.now() - startedAt) / 1000, durSec - 1);
      if (elapsed < 10) return;
      watchHeartbeat();
      savePosition(show.id, "tv", elapsed, durSec, selectedSeason, selectedEpisode);
      saveLastEpisode(show.id, selectedSeason, selectedEpisode);
      const epName = episodes.find((e) => e.episode_number === selectedEpisode)?.name || "";
      addToHistory({
        id: show.id, type: "tv", title: show.name, poster_path: show.poster_path,
        vote_average: show.vote_average, first_air_date: show.first_air_date, watchedAt: Date.now(),
        progress: elapsed, duration: durSec, season: selectedSeason, episode: selectedEpisode,
        episodeName: epName, genre_ids: show.genres?.map((g) => g.id),
        episodeCount: show.seasons?.find((s) => s.season_number === selectedSeason)?.episode_count,
        seasonCount: show.seasons?.filter((s) => s.season_number > 0).length,
      });
    };
    const iv = setInterval(write, 20000);
    return () => { clearInterval(iv); write(); };
  }, [showPlayer, streamData?.collapsEmbed, show, selectedSeason, selectedEpisode, episodes]);

  // Prefetch the selected episode's stream before the user presses "Смотреть"
  // so the first play is instant. Only warms while the player isn't open;
  // fetchStream consumes this in-flight request when the URL matches.
  useEffect(() => {
    if (showPlayer) return;
    let alive = true;
    // Collaps (=LordFilm) — resolve the iframe embed for this episode (their
    // player handles seasons/episodes/dubs itself).
    if (isIframeSource()) {
      (async () => {
        const embed = await resolveIframeEmbed(show.id, "tv", selectedSeason, selectedEpisode, { allohaFallbackToZenith: !isProRef.current });
        if (alive && embed) setStreamData({ collaps: true, collapsEmbed: embed });
      })();
      return () => { alive = false; };
    }
    // kino.pub source — prewarm this episode via the resolver worker (single
    // adaptive hls4: all dubs+qualities in the manifest). Skips HDRezka.
    if (getSource() === "kinopub") {
      (async () => {
        const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
        const kpTitle = ((show.name || (show as any).original_name || "") as string).replace(/["«»""]/g, "").trim();
        if (!kpTitle) return;
        const kp = await resolveKinopub({ tmdbId: show.id, title: kpTitle, otitle: show.original_name, year, type: "tv", season: selectedSeason, episode: selectedEpisode });
        if (!alive || !kp) return;
        const c: any = (navigator as any).connection;
        const fast = !c || (!c.saveData && c.type !== "cellular" && c.effectiveType !== "2g" && c.effectiveType !== "slow-2g" && c.effectiveType !== "3g");
        if (fast && !startedRef.current) setStreamData({ stream: kp.hls4, kinopub: true, quality: "Auto" });
      })();
      return () => { alive = false; };
    }
    try {
      const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
      const ruName = (show.name || "").replace(/["«»""]/g, "").trim();
      const origName = ((show as any).original_name || "").replace(/["«»""]/g, "").trim();
      const searchName = ruName || origName;
      if (!searchName) return;
      const tr = getLastTranslator(show.id, "tv")?.id ?? null;
      const q = encodeURIComponent(searchName);
      // Pass original name so the backend can disambiguate generic RU titles
      // HDRezka mis-resolves; it only pays the extra search when the RU hit
      // isn't exact.
      const origParam = (origName && origName !== searchName) ? "&orig=" + encodeURIComponent(origName) : "";
      const castNames = (((show as any).credits?.cast) || []).slice(0, 6).map((c: any) => c?.name).filter(Boolean).join(",");
      const castParam = castNames ? "&cast=" + encodeURIComponent(castNames) : "";
      const trParam = tr ? "&translator_id=" + tr : "";
      const url = "/hdrezka/api/search?q=" + q + "&year=" + year + "&type=tv&season=" + selectedSeason + "&episode=" + selectedEpisode + origParam + castParam + trParam;
      const p = fetch(url).then((r) => r.json()).catch(() => null);
      prefetchRef.current = { url, promise: p };
      p.then((d: any) => {
        if (!alive || !d?.stream) return;
        // Surface the dub list + resolved URL on the page BEFORE play, so the
        // visible "Озвучка" selector shows and the per-dub season/episode gating
        // works straight away (not only after the player opens).
        if (d.translators?.length) {
          setTranslators((prev) => (prev.length ? prev : d.translators));
          setSelectedTranslator((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
        }
        // Warm the CDN connection + manifest on open so play starts fast.
        warmStream(d.stream);
        // Pre-buffer the episode (mounts hidden) on a fast connection — skip on
        // mobile. Everything plays through the LeadSeek proxy (applyStream), so
        // there's no throttle lottery and no speed probe needed.
        const c: any = (navigator as any).connection;
        const fast = !c || (!c.saveData && c.type !== "cellular" &&
          c.effectiveType !== "2g" && c.effectiveType !== "slow-2g" && c.effectiveType !== "3g");
        if (fast && !startedRef.current) applyStream(d);
        // Even on a slow link (no pre-buffer), expose the resolved URL so the
        // season/episode gating effect can scope selectors to the dub pre-play.
        else setStreamData((prev: any) => prev ?? { url: d.url, translators: d.translators, active_translator_id: d.active_translator_id });
      });
    } catch {}
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show.id, selectedSeason, selectedEpisode, showPlayer]);

  useEffect(() => {
    const loadEpisodes = async () => {
      setLoadingEpisodes(true);
      try {
        const res = await fetch("/api/tv-episodes?id=" + show.id + "&season=" + selectedSeason);
        const eps = await res.json();
        setEpisodes(Array.isArray(eps) ? eps : []);
      } catch { setEpisodes([]); }
      finally { setLoadingEpisodes(false); }
    };
    loadEpisodes();
  }, [selectedSeason, show.id]);

  // Apply a fetched resolve with the smart default quality (connection-aware +
  // remembered manual choice) instead of the backend's raw max.
  const applyStream = (d: any) => {
    const sq = pickDefaultQuality(d.streams, d.quality);
    // Everything plays through the LeadSeek proxy — no per-route throttle lottery.
    const url = sq && d.streams?.[sq] ? hlsProxyUrl(d.streams[sq]) : d.stream;
    setStreamData(sq && d.streams?.[sq] ? { ...d, stream: url, quality: sq } : d);
    setSelectedQuality(sq || d.quality);
    if (d.translators?.length) {
      setTranslators(d.translators);
      setSelectedTranslator((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
    }
  };

  const fetchStream = async (season: number, episode: number, translatorId?: number | null, _attempt = 0) => {
    setLoading(true);
    setError("");
    let retrying = false; // when true, the finally skips clearing loading

    // Zenithjs source — resolve the iframe embed for this episode. НЕ гейтить по
    // translatorId: у zenithjs озвучки внутри iframe, а selectEpisode передаёт
    // selectedTranslator — из-за гейта смена серии падала в HDRezka и возвращала
    // наш ArtPlayer. При source=zenithjs всегда остаёмся на iframe.
    if (isIframeSource() && _attempt === 0) {
      try {
        const embed = await resolveIframeEmbed(show.id, "tv", season, episode, { allohaFallbackToZenith: !isProRef.current });
        if (embed) { setStreamData({ collaps: true, collapsEmbed: embed }); setLoading(false); return; }
      } catch {}
      setError(getSource() === "alloha" ? "Этой серии нет в Alloha." : "Этой серии нет на бесплатном источнике. Она доступна по подписке Про.");
      setLoading(false);
      return;
    }

    // kino.pub source — resolve THIS episode to one adaptive hls4 (all dubs as
    // audio renditions → instant switch in the player, no re-resolve). Only on
    // initial/episode resolve (translatorId==null); dub switches are internal.
    // Soft fallback to HDRezka if kino.pub lacks the title/episode.
    // НЕ гейтим по translatorId: selectEpisode передаёт selectedTranslator (id
    // озвучки HDRezka), и из-за гейта сериал на kino.pub уходил в HDRezka. У
    // kino.pub озвучки — аудиодорожки в плеере (смена внутренняя, fetchStream не
    // зовётся), поэтому translatorId тут не нужен.
    if (getSource() === "kinopub" && _attempt === 0) {
      try {
        const kpYear = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
        const kpTitle = ((show.name || (show as any).original_name || "") as string).replace(/["«»""]/g, "").trim();
        const kp = await resolveKinopub({ tmdbId: show.id, title: kpTitle, otitle: show.original_name, year: kpYear, type: "tv", season, episode });
        if (kp) {
          setStreamData({ stream: kp.hls4, kinopub: true, quality: "Auto" });
          setLoading(false);
          setTranslatorLoading(false);
          return;
        }
      } catch {}
      // промах kino.pub → продолжаем в HDRezka ниже
    }
    // Fallback chain — explicit arg > state > localStorage. Storage read covers
    // the race where the play button is tapped before the initial restore effect
    // sets selectedTranslator; without this the backend gets no translator_id
    // and returns the default dub even though the label shows the saved one.
    const effectiveTr = translatorId ?? selectedTranslator ?? getLastTranslator(show.id, "tv")?.id ?? null;
    if (effectiveTr && effectiveTr !== selectedTranslator) setSelectedTranslator(effectiveTr);
    if (!effectiveTr) setStreamData(null);
    try {
      const year = show.first_air_date ? new Date(show.first_air_date).getFullYear() : "";
      // HDRezka indexes most titles under their RUSSIAN name, but some resolve
      // ONLY by the ORIGINAL name (e.g. TMNT 2012: "Черепашки-ниндзя" returns
      // Not found, "Teenage Mutant Ninja Turtles" resolves). Try the localized
      // name first, then fall back to the original if nothing resolves.
      const origName = ((show as any).original_name || "").replace(/["«»""]/g, "").trim();
      const ruName = (show.name || "").replace(/["«»""]/g, "").trim();
      const candidates = [ruName, origName].filter((n, i, a) => n && a.indexOf(n) === i);
      const castNames = (((show as any).credits?.cast) || []).slice(0, 6).map((c: any) => c?.name).filter(Boolean).join(",");
      const castParam = castNames ? "&cast=" + encodeURIComponent(castNames) : "";
      const trParam = effectiveTr ? "&translator_id=" + effectiveTr : "";
      let q = "";
      let url = "";
      let data: any = null;
      for (const name of candidates) {
        q = encodeURIComponent(name);
        const origParam = (name === ruName && origName && origName !== ruName) ? "&orig=" + encodeURIComponent(origName) : "";
        url = "/hdrezka/api/search?q=" + q + "&year=" + year + "&type=tv&season=" + season + "&episode=" + episode + origParam + castParam + trParam;
        // Reuse the warmed prefetch when it matches (instant play); otherwise fetch.
        let di: any = null;
        if (prefetchRef.current && prefetchRef.current.url === url) {
          di = await prefetchRef.current.promise;
          prefetchRef.current = null;
        }
        if (!di) {
          const res = await fetch(url);
          di = await res.json();
        }
        data = di;
        // Stop at the first name that yields a stream or candidate results.
        if (data && (data.stream || (data.results && data.results.length > 0))) break;
      }
      if (data.stream) {
        // What translator is ACTUALLY playing? Trust the backend's
        // active_translator_id — NOT effectiveTr. They diverge when the
        // requested dub hasn't covered this episode (e.g. Яроцкий dubbed
        // eps 1-2 but not 3): HDRezka silently substitutes another dub,
        // usually a premium one whose stream is a 1-min "buy subscription"
        // stub. Using effectiveTr here hid that — the old code thought it
        // was playing the free dub and happily showed the stub.
        const actualId: number | undefined = data.active_translator_id ?? data.translators?.[0]?.id;
        const actualTr = data.translators?.find((t: any) => t.id === actualId);
        const actualIsPremium = !!actualTr?.is_premium;
        const requestedId = effectiveTr;
        const substituted = requestedId != null && actualId != null && requestedId !== actualId;
        const freeAlt = data.translators?.find((t: any) => !t.is_premium && t.id !== requestedId);

        // Case A — first load with no explicit pick: if the server default is
        // a premium stub, silently switch to a free dub (existing behaviour).
        if (!translatorId && actualIsPremium && freeAlt) {
          setTranslators(data.translators);
          setSelectedTranslator(freeAlt.id);
          saveLastTranslator(show.id, "tv", freeAlt.id, freeAlt.name);
          return fetchStream(season, episode, freeAlt.id);
        }

        // Case B — the requested dub was substituted with a premium stub:
        // this episode isn't dubbed in the chosen voiceover. Do NOT play the
        // 1-min stub. Show the dub list + a notice; let the user pick another.
        if (substituted && actualIsPremium) {
          if (data.translators?.length) setTranslators(data.translators);
          setStreamData(null);
          setError(
            `Серия ${episode} в выбранной озвучке ещё не вышла. Выберите другую озвучку.`,
          );
          setShowTranslators(true);
          return;
        }

        applyStream(data);
        if (data.translators && data.translators.length > 0 && translators.length === 0) {
          setTranslators(data.translators);
          if (!selectedTranslator) {
            setSelectedTranslator(data.active_translator_id ?? data.translators[0].id);
          }
        }
        // Track which dub user is actually watching with — counts toward Polyglot
        const activeId = effectiveTr ?? data.active_translator_id ?? data.translators?.[0]?.id;
        const activeName = data.translators?.find((t: any) => t.id === activeId)?.name;
        if (activeName) recordTranslatorTry(activeName);
        return;
      }
      if (data.results && data.results.length > 0) {
        for (let i = 0; i < Math.min(data.results.length, 5); i++) {
          const res2 = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&index=" + i + "&season=" + season + "&episode=" + episode + trParam);
          const data2 = await res2.json();
          if (data2.stream) {
            applyStream(data2);
            if (data2.translators && data2.translators.length > 0 && translators.length === 0) {
              setTranslators(data2.translators);
              if (!selectedTranslator) {
                setSelectedTranslator(data2.active_translator_id ?? data2.translators[0].id);
              }
            }
            const activeId2 = effectiveTr ?? data2.active_translator_id ?? data2.translators?.[0]?.id;
            const activeName2 = data2.translators?.find((t: any) => t.id === activeId2)?.name;
            if (activeName2) recordTranslatorTry(activeName2);
            return;
          }
        }
        setError("Серия не найдена");
      } else {
        // Auto-retry once on a transient resolve error before giving up.
        if (_attempt < 1) { retrying = true; await new Promise(r => setTimeout(r, 800)); return fetchStream(season, episode, translatorId, _attempt + 1); }
        setError(data.error || "Сериал не найден");
      }
    } catch {
      if (_attempt < 1) { retrying = true; await new Promise(r => setTimeout(r, 800)); return fetchStream(season, episode, translatorId, _attempt + 1); }
      setError("Сервер не отвечает");
    }
    finally { if (!retrying) { setLoading(false); setTranslatorLoading(false); } }
  };

  const fetchSubtitles = useCallback(async () => {
    const key = `${show.id}/${selectedSeason}/${selectedEpisode}`;
    if (subsFetchedKeyRef.current === key) return;
    subsFetchedKeyRef.current = key;
    try {
      const params = new URLSearchParams({
        tmdb: String(show.id),
        season: String(selectedSeason),
        episode: String(selectedEpisode),
      });
      const res = await fetch(`/api/subtitles?${params}`);
      const data = await res.json();
      setSubtitles(data.subs || []);
    } catch {
      setSubtitles([]);
    }
  }, [show.id, selectedSeason, selectedEpisode]);

  // Reset subtitles on episode change
  useEffect(() => {
    setSelectedSubtitleId(null);
    setSubtitles([]);
    subsFetchedKeyRef.current = "";
  }, [selectedSeason, selectedEpisode]);

  const changeTranslator = async (trId: number) => {
    if (trId === selectedTranslator) { setShowTranslators(false); return; }
    setSelectedTranslator(trId);
    const trName = translators.find(t => t.id === trId)?.name || "";
    saveLastTranslator(show.id, "tv", trId, trName);
    setShowTranslators(false);
    setTranslatorLoading(true);
    // Resume at the current position once the new dub loads — via the reliable
    // seekOnSwitch path (the old fixed 500ms seek fired before the proxied
    // stream was ready → restarted at 0).
    const currentTime = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(currentTime > 1 ? currentTime : undefined);
    await fetchStream(selectedSeason, selectedEpisode, trId);
  };

  // Min-show маскота 800ms — гарантия что не моргнёт
  useEffect(() => {
    if (loading) { setShowLoadingMascot(true); return; }
    const t = setTimeout(() => setShowLoadingMascot(false), 800);
    return () => clearTimeout(t);
  }, [loading]);

  // HLS loading + recovery + visibilitychange resume all live inside ArtPlayerView now.
  // The resume-time prompt still uses parent state — once stream is ready, ArtPlayer
  // jumps to the saved position automatically via the `resumeTime` prop.
  useEffect(() => {
    if (!streamData?.stream) return;
    const pos = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
    if (pos && pos.time > 10 && !translatorLoading) {
      setShowResume(true);
    }
  }, [streamData, show.id, selectedSeason, selectedEpisode, translatorLoading]);

  // Плеер теперь под блоком инфо — по «Смотреть»/выбору серии прокручиваем к нему.
  const scrollToPlayer = () => {
    requestAnimationFrame(() => containerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  // Open the player for the selected episode. resume=false → from 0
  // ("Смотреть"); resume=true → seek to the saved position ("Продолжить").
  const openPlayerEp = (resume: boolean) => {
    if (!requireAuth("Войдите, чтобы смотреть сериалы и сохранять прогресс")) return;
    startedRef.current = true;
    setWantResume(resume);
    if (resume && resumeTime && videoRef.current) videoRef.current.currentTime = resumeTime;
    setShowPlayer(true);
    // Start the (pre-warmed) video WITHIN this tap gesture — see movie-player:
    // the async autoStart effect lost the gesture on mobile, so ArtPlayer showed
    // its own poster + play over ours (the "two play buttons / tap twice" bug).
    const v = videoRef.current;
    if (v && streamData?.stream) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => { try { v.muted = true; v.play().catch(() => {}); } catch {} });
    }
    // If the episode was pre-warmed (streamData set on open), revealing it flips
    // autoStart → it starts the buffered video instantly. Only cold-resolve when
    // nothing is prewarmed yet.
    if (!streamData?.stream && !streamData?.collapsEmbed) fetchStream(selectedSeason, selectedEpisode, selectedTranslator);
  };

  const handleResume = () => {
    if (videoRef.current && resumeTime) videoRef.current.currentTime = resumeTime;
    setShowResume(false);
  };

  const handleStartOver = () => {
    if (videoRef.current) videoRef.current.currentTime = 0;
    setShowResume(false);
  };

  const changeQuality = (q: string) => {
    if (!streamData?.streams?.[q]) return;
    setQualityPref(q); // remember explicit choice for future titles
    // Always via the proxy — any tier loads reliably, no throttle lottery.
    const url = hlsProxyUrl(streamData.streams[q]);
    // Start the new stream AT the current position (seekOnSwitch) instead of
    // resetting to 0; only re-assert play — never touch currentTime (that would
    // fight a forward seek made right after switching).
    const pos = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(pos > 1 ? pos : undefined);
    setSelectedQuality(q);
    setStreamData((prev: any) => prev ? { ...prev, stream: url } : prev);
    let n = 0;
    const iv = setInterval(() => {
      const v = videoRef.current;
      if (v && v.paused && v.readyState >= 2) v.play().catch(() => {});
      if ((v && !v.paused) || ++n > 16) clearInterval(iv);
    }, 400);
  };

  const selectEpisode = (season: number, episode: number) => {
    setSelectedSeason(season);
    setSelectedEpisode(episode);
    setShowEpisodes(false);
    setShowSeasons(false);
    setShowResume(false);
    setResumeTime(null);
    // Sync URL so bookmarks/back-button match the currently-playing episode
    try { router.replace(`${pathname}?s=${season}&e=${episode}`, { scroll: false }); } catch {}
    fetchStream(season, episode, selectedTranslator);
  };

  // Released episodes only (filter unaired ones — TMDB sometimes lists future episodes
  // which HDRezka cannot resolve and falls back to episode 1 = duplicate content bug)
  const releasedEpisodes = episodes.filter(e => !e.air_date || new Date(e.air_date) <= new Date());

  // HDRezka-style: once a dub is active (and we know the resolved HDRezka URL),
  // load exactly the seasons/episodes THAT dub has and scope the selectors to it.
  // Keyed by (url, translator) so it loads once per combo; auto-corrects the
  // season if the current one isn't dubbed in the chosen voiceover.
  useEffect(() => {
    const url = streamData?.url;
    const tr = selectedTranslator;
    if (!url || !tr) return;
    const key = url + "|" + tr;
    if (availKeyRef.current === key) return;
    availKeyRef.current = key;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/hdrezka/api/episodes?url=" + encodeURIComponent(url) + "&translator_id=" + tr);
        const d = await res.json();
        if (!alive || !d?.seasons) return;
        const tree: Record<number, number[]> = {};
        for (const [s, eps] of Object.entries(d.seasons)) tree[parseInt(s, 10)] = (eps as number[]) || [];
        setAvailTree(tree);
        const seasonsAvail = Object.keys(tree).map(Number).sort((a, b) => a - b);
        // Current season not in this dub → jump to its first available season.
        if (seasonsAvail.length && !tree[selectedSeason]) {
          const s0 = seasonsAvail[0];
          selectEpisode(s0, (tree[s0] && tree[s0][0]) || 1);
        }
      } catch { /* keep showing full TMDB structure on failure */ }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamData?.url, selectedTranslator]);

  // Which dubs have the current (season, episode) — for filtering the in-player
  // dub switcher. Keyed by (url, season, episode); reloads when the user moves
  // to another episode.
  useEffect(() => {
    const url = streamData?.url;
    if (!url) return;
    const key = url + "|" + selectedSeason + "|" + selectedEpisode;
    if (eptrKeyRef.current === key) return;
    eptrKeyRef.current = key;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/hdrezka/api/episode-translators?url=" + encodeURIComponent(url) +
          "&season=" + selectedSeason + "&episode=" + selectedEpisode);
        const d = await res.json();
        if (!alive) return;
        setEpisodeDubIds(Array.isArray(d?.ids) ? d.ids : null);
      } catch { if (alive) setEpisodeDubIds(null); }
    })();
    return () => { alive = false; };
  }, [streamData?.url, selectedSeason, selectedEpisode]);

  // Seasons the selected dub actually has (null tree → all). Episode numbering
  // can diverge from TMDB on long anime (cumulative numbering), so only gate
  // episodes when the dub's numbers actually overlap TMDB's — otherwise show all
  // TMDB episodes so nothing vanishes on a numbering mismatch.
  const gatedSeasons = availTree
    ? validSeasons.filter(s => (availTree[s.season_number]?.length ?? 0) > 0)
    : validSeasons;
  const _treeEps = availTree?.[selectedSeason];
  const _epOverlap = !!_treeEps && episodes.some(e => _treeEps.includes(e.episode_number));
  const gatedEpisodes = _epOverlap ? episodes.filter(e => _treeEps!.includes(e.episode_number)) : episodes;

  // Dubs offered IN THE PLAYER = those that have the current episode, kept in a
  // STICKY per-episode union so the list only grows and never drops a dub when
  // you switch (episode-translators can come back partial from a flaky HDRezka
  // scrape; the old code showed episodeDubIds ∪ {active}, so switching away from
  // a dub that wasn't in the partial set made it vanish). Falls back to all when
  // nothing is known yet.
  const playerDubs = (() => {
    const epKey = (streamData?.url || "") + "|" + selectedSeason + "|" + selectedEpisode;
    const u = dubUnionRef.current;
    if (u.key !== epKey) { u.key = epKey; u.ids = new Set(); }
    if (episodeDubIds && episodeDubIds.length) episodeDubIds.forEach(id => u.ids.add(id));
    if (selectedTranslator != null) u.ids.add(selectedTranslator);
    if (u.ids.size === 0) return translators;
    const f = translators.filter(t => u.ids.has(t.id));
    return f.length ? f : translators;
  })();

  const hasNextEpisode = (() => {
    const idx = releasedEpisodes.findIndex(e => e.episode_number === selectedEpisode);
    if (idx >= 0 && idx < releasedEpisodes.length - 1) return true;
    return selectedSeason < validSeasons.length;
  })();

  const nextEpisode = (opts?: { manual?: boolean }) => {
    // Cooldown guards EVERY auto-advance path (ended listener, loopback
    // detector, AND the SkipOverlays outro countdown). After a switch the new
    // HLS source briefly reports the old episode's near-end position; without
    // this any of those paths re-fired and chained 2-3 episodes forward.
    // Manual clicks (user pressing "Следующая серия") bypass the cooldown.
    if (!opts?.manual && Date.now() - lastAdvanceAtRef.current < ADVANCE_COOLDOWN_MS) return;
    lastAdvanceAtRef.current = Date.now();
    const currentEpIndex = releasedEpisodes.findIndex(e => e.episode_number === selectedEpisode);
    if (currentEpIndex >= 0 && currentEpIndex < releasedEpisodes.length - 1) {
      selectEpisode(selectedSeason, releasedEpisodes[currentEpIndex + 1].episode_number);
    } else if (selectedSeason < validSeasons.length) {
      selectEpisode(selectedSeason + 1, 1);
    }
  };

  // Previous episode (within the current season) — for the control-bar ‹ button.
  const hasPrevEpisode = (() => {
    const idx = releasedEpisodes.findIndex(e => e.episode_number === selectedEpisode);
    return idx > 0;
  })();
  const prevEpisode = () => {
    const idx = releasedEpisodes.findIndex(e => e.episode_number === selectedEpisode);
    if (idx > 0) selectEpisode(selectedSeason, releasedEpisodes[idx - 1].episode_number);
  };

  // Keep hasNextEpisode in a ref so listeners attached once read the latest value.
  const hasNextEpisodeRef = useRef(hasNextEpisode);
  useEffect(() => { hasNextEpisodeRef.current = hasNextEpisode; }, [hasNextEpisode]);

  // Auto-advance to the next episode when the current one ends.
  // No countdown overlay — just immediate transition. Native fullscreen on
  // <video> hides custom overlays anyway, so a no-UI auto-jump is more reliable
  // and matches what the user wants.
  // Also covers a case where some browsers loop-back to time 0 instead of firing
  // a clean ended event after fullscreen: a timeupdate watcher catches that too.
  useEffect(() => {
    if (!showPlayer) return;
    let cleanupFn: (() => void) | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let lastTime = 0;
    const attach = () => {
      const v = videoRef.current;
      if (!v) {
        retryTimer = setTimeout(attach, 200);
        return;
      }
      const triggerNext = () => {
        if (autoplayTriggeredRef.current) return;
        if (!hasNextEpisodeRef.current) return;
        // Cooldown lives inside nextEpisode() now (guards every path); bail
        // early here too so we don't flip autoplayTriggeredRef on a stale signal.
        if (Date.now() - lastAdvanceAtRef.current < ADVANCE_COOLDOWN_MS) return;
        autoplayTriggeredRef.current = true;
        // Flush a final history entry for the just-ended episode BEFORE we
        // switch — the 5-second save interval may not have fired since the
        // final 5 seconds of playback. Without this, episodes auto-advanced
        // mid-cycle land with stale progress (or no entry at all if it was
        // a fresh start).
        try {
          const v = videoRef.current;
          const ctx = ctxRef.current;
          if (v && v.duration > 0) {
            savePosition(show.id, "tv", v.duration, v.duration, ctx.season, ctx.episode);
            const epName = ctx.episodes.find(e => e.episode_number === ctx.episode)?.name || "";
            const trName = ctx.translators.find(t => t.id === ctx.translatorId)?.name || "";
            addToHistory({
              id: show.id, type: "tv", title: show.name,
              poster_path: show.poster_path, vote_average: show.vote_average,
              first_air_date: show.first_air_date, watchedAt: Date.now(),
              progress: v.duration, duration: v.duration, season: ctx.season,
              episode: ctx.episode, episodeName: epName, quality: ctx.quality,
              translatorName: trName, translatorId: ctx.translatorId || undefined,
              genre_ids: show.genres?.map(g => g.id),
              episodeCount: show.seasons?.find(s => s.season_number === ctx.season)?.episode_count,
              seasonCount: show.seasons?.filter(s => s.season_number > 0).length,
            });
          }
        } catch {}
        nextEpisode();
      };
      // Real end-of-video only — not a seek that landed past the end. When the
      // user fast-scrubs to ~99%, the browser can fire `ended`; without the
      // seeking guard that auto-advanced, and the loopback detector below then
      // fired again on the next stream's stale position, chaining 2-3 episodes.
      const onEnded = () => { if (!v.seeking) triggerNext(); };
      const onTime = () => {
        const ct = v.currentTime, dur = v.duration || 0;
        // Fullscreen-loopback: was near the end, now jumped back to ~0 → the
        // episode really ended. Guard on !seeking so scrubbing back to the
        // start (a normal user action) is NOT mistaken for an ended episode.
        if (!v.seeking && lastTime > dur - 1.5 && lastTime > 5 && ct < 1 && dur > 60) {
          triggerNext();
        }
        lastTime = ct;
      };
      v.addEventListener("ended", onEnded);
      v.addEventListener("timeupdate", onTime);
      cleanupFn = () => {
        v.removeEventListener("ended", onEnded);
        v.removeEventListener("timeupdate", onTime);
      };
    };
    attach();
    return () => {
      if (retryTimer) clearTimeout(retryTimer);
      if (cleanupFn) cleanupFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPlayer, selectedSeason, selectedEpisode, streamData]);

  // Block auto-advance across an episode switch, release once the new episode
  // is genuinely playing from the start. During a source swap the old <video>
  // (or the new one mid-load) can briefly report a near-end currentTime; with
  // the guard left open that stale reading re-fired triggerNext and chained
  // several episodes forward. We arm the guard here (blocking) and a watcher
  // clears it when currentTime returns below 5s on the new stream.
  useEffect(() => {
    autoplayTriggeredRef.current = true;
    const v = videoRef.current;
    if (!v) { autoplayTriggeredRef.current = false; return; }
    const release = () => {
      if (v.currentTime < 5 && !v.seeking) {
        autoplayTriggeredRef.current = false;
        v.removeEventListener("timeupdate", release);
      }
    };
    v.addEventListener("timeupdate", release);
    // Safety net: never leave it permanently blocked if the new stream never
    // reports a low time for some reason.
    const t = setTimeout(() => { autoplayTriggeredRef.current = false; v.removeEventListener("timeupdate", release); }, 8000);
    return () => { clearTimeout(t); v.removeEventListener("timeupdate", release); };
  }, [selectedSeason, selectedEpisode]);

  const toggleFullscreen = () => {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const isTelegram = !!(window as any).Telegram?.WebApp;
    if (isTelegram) { try { (window as any).Telegram.WebApp.requestFullscreen(); } catch {} }
    // On desktop, fullscreen the WHOLE player container (not just <video>) so
    // overlays like the autoplay countdown remain visible.
    if (!isMobile && !isTelegram && containerRef.current?.requestFullscreen) {
      containerRef.current.requestFullscreen().catch(() => setCssFullscreen(true));
      return;
    }
    setCssFullscreen(!cssFullscreen);
    try { screen.orientation.lock("landscape").catch(() => {}); } catch {}
  };

  useEffect(() => {
    if (!cssFullscreen) { try { screen.orientation.unlock(); } catch {} }
  }, [cssFullscreen]);

  const formatTime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60);
    return h > 0 ? `${h}:${m.toString().padStart(2,"0")}:${sec.toString().padStart(2,"0")}` : `${m}:${sec.toString().padStart(2,"0")}`;
  };

  const getTranslatorName = () => {
    if (!selectedTranslator || translators.length === 0) return "Озвучка";
    const t = translators.find(t => t.id === selectedTranslator);
    return t ? t.name : "Озвучка";
  };

  const backdropUrl = show.backdrop_path
    ? "/tmdb-img/w1280" + show.backdrop_path
    : show.poster_path
      ? "/tmdb-img/w780" + show.poster_path
      : null;

  const currentEpisodeName = episodes.find(e => e.episode_number === selectedEpisode)?.name || "Серия " + selectedEpisode;

  return (
    <div className="relative w-full">
      {/* flex-col + order-* : инфо (order-1) сверху, плеер (order-2) под ним,
          переключатель (order-3), список эпизодов (order-4) — снизу. В
          фуллскрине плеер fixed и выпадает из потока, order неважен. */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
        <div ref={containerRef} className={cssFullscreen
          ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          : "order-2 mt-8 aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5 group"
        }>
          {/* Player mounts + pre-buffers as soon as the episode resolves
              (autoStart=false) HIDDEN behind the poster, so pressing play starts
              instantly. interactive={showPlayer} keeps the pre-warmed player
              non-interactive until the auth gate passes, so unregistered users
              can't tap the hidden player and bypass the gate. */}
          {streamData?.stream && (
            <ArtPlayerView
              interactive={showPlayer}
              streamUrl={streamData.stream}
              poster={backdropUrl || undefined}
              kinopubMode={!!streamData.kinopub}
              qualities={streamData.kinopub ? undefined : streamData.streams}
              selectedQuality={selectedQuality}
              onQualityChange={changeQuality}
              translators={streamData.kinopub ? [] : playerDubs}
              selectedTranslator={selectedTranslator}
              onTranslatorChange={changeTranslator}
              subtitles={subtitles}
              selectedSubtitleId={selectedSubtitleId}
              onSubtitleChange={setSelectedSubtitleId}
              onLoadSubtitles={fetchSubtitles}
              resumeTime={wantResume ? (resumeTime || undefined) : undefined}
              seekOnSwitch={seekOnSwitch}
              autoStart={showPlayer}
              episodeNav={{ hasPrev: hasPrevEpisode, hasNext: hasNextEpisode }}
              onPrevEpisode={prevEpisode}
              onNextEpisode={() => nextEpisode({ manual: true })}
              onVideoReady={(v) => { videoRef.current = v; startSaving(); }}
              onVideoUnmount={() => { videoRef.current = null; if (saveInterval.current) clearInterval(saveInterval.current); }}
              onPlayerContainerReady={setPlayerContainer}
            />
          )}
          {/* Collaps (=LordFilm) — сторонний iframe со своими сезонами/сериями/
              озвучками. Наши ArtPlayer/панель серий/скипы тут не участвуют. */}
          {/* Контент-iframe: Pro сразу, free — только после пре-ролла (adDone). */}
          {showPlayer && streamData?.collapsEmbed && (isPro || adDone) && (
            <iframe
              key={streamData.collapsEmbed}
              src={streamData.collapsEmbed}
              className="absolute inset-0 w-full h-full border-0 z-10"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          )}
          {/* Пре-ролл реклама (free). Ждём резолва подписки, чтобы не мигнуть Pro. */}
          {showPlayer && streamData?.collapsEmbed && !isPro && !subLoading && !adDone && (
            <PreRollAd src={AD_URL} onDone={() => setAdDone(true)} />
          )}
          {streamData?.stream && showPlayer && (
            <SkipOverlays
              videoRef={videoRef}
              playerContainer={playerContainer}
              tmdbId={show.id}
              type="tv"
              season={selectedSeason}
              episode={selectedEpisode}
              hasNextEpisode={hasNextEpisode}
              onNextEpisode={nextEpisode}
            />
          )}
          {streamData?.stream && showPlayer && (
            <PlayerEpisodeBar
              container={playerContainer}
              seasons={gatedSeasons}
              episodes={gatedEpisodes}
              dubs={streamData.kinopub ? [] : playerDubs}
              selectedSeason={selectedSeason}
              selectedEpisode={selectedEpisode}
              selectedTranslator={selectedTranslator}
              onSeason={(s) => selectEpisode(s, 1)}
              onEpisode={(e) => selectEpisode(selectedSeason, e)}
              onDub={changeTranslator}
              hasPrev={hasPrevEpisode}
              hasNext={hasNextEpisode}
              onPrev={prevEpisode}
              onNext={() => nextEpisode({ manual: true })}
            />
          )}
          {streamData?.stream && showPlayer && translatorLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-white text-sm">Смена озвучки...</p>
              </div>
            </div>
          )}

          {/* Loading mascot / error — only after play was pressed and the
              episode isn't ready yet (cold start / dub substituted). */}
          {showPlayer && !streamData?.stream && error ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 px-8 overflow-y-auto py-8">
              <p className="text-red-400 text-center text-lg">{error}</p>
              {translators.length > 1 && (
                <div className="w-full max-w-sm">
                  <p className="text-[11px] uppercase tracking-wider text-white/45 font-semibold mb-2 text-center">Выберите озвучку</p>
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                    {Array.from(new Map(translators.map(t => [t.id, t])).values()).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setError(""); fetchStream(selectedSeason, selectedEpisode, t.id); }}
                        className={`flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg text-[14px] text-left transition-colors ${
                          t.id === selectedTranslator ? "bg-primary/20 text-white" : "bg-white/[0.06] text-white hover:bg-white/[0.12]"
                        }`}
                      >
                        <span>{t.name}</span>
                        {t.id === selectedTranslator && <span className="text-primary text-xs">текущая</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <button onClick={() => fetchStream(selectedSeason, selectedEpisode)} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-medium transition-colors">Попробовать снова</button>
            </div>
          ) : showPlayer && !streamData?.stream && !streamData?.collapsEmbed && (loading || showLoadingMascot) ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4">
              <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-[15px] font-medium text-white/85">{translatorLoading ? "Смена озвучки..." : "Загрузка серии"}</p>
              <p className="text-gray-500 text-sm -mt-2">{"Сезон " + selectedSeason + ", Серия " + selectedEpisode}</p>
            </div>
          ) : null}

          {/* Poster overlay — transparent catcher over the (pre-buffering)
              player; backdrop + a single play circle show only before the
              player has mounted. */}
          {!showPlayer && (
            <div className="absolute inset-0 z-30 cursor-pointer group/play" onClick={() => openPlayerEp(false)}>
              {backdropUrl && <img src={backdropUrl} alt={show.name} className={"absolute inset-0 w-full h-full " + (show.backdrop_path ? "object-cover" : "object-contain bg-black/90")} />}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-xl shadow-black/40 transition-transform duration-300 group-hover/play:scale-110">
                  <Play size={38} className="text-black ml-1" fill="currentColor" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Апселл на Про — под бесплатным (zenithjs) плеером */}
        {!cssFullscreen && <div className="order-3"><PlayerSwitcher /></div>}
        {!isPro && !subLoading && !cssFullscreen && <div className="order-3"><ProUpsell /></div>}

        {!cssFullscreen && (
          <>
            {/* === INFO CARD === (order-1: над плеером) + кино-бэкдроп «для красоты»
                (как у фильмов). Скругление/клип на внутреннем слое, карточка
                overflow-visible — чтобы выпадашка «Скачать» не обрезалась. */}
            <div className="order-1 relative rounded-3xl ring-1 ring-white/[0.07]">
              {backdropUrl && show.backdrop_path && (
                <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none select-none">
                  <img src={backdropUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover object-[center_18%]" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,12,0.74) 0%, rgba(10,10,12,0.88) 55%, rgba(10,10,12,0.97) 100%)" }} />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,10,12,0.55) 0%, rgba(10,10,12,0.15) 60%, rgba(10,10,12,0) 100%)" }} />
                </div>
              )}
              <section className="relative grid grid-cols-[120px_1fr] sm:grid-cols-[180px_1fr] gap-5 sm:gap-7 p-5 sm:p-8">
              {/* Poster */}
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] shadow-2xl shadow-black/40 aspect-[2/3] bg-foreground/[0.04]">
                {show.poster_path && (
                  <img
                    src={getImageUrl(show.poster_path, "w342")}
                    alt={show.name}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              {/* Right column */}
              <div className="space-y-3.5 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-2xl sm:text-4xl font-bold text-foreground tracking-tight">{show.name}</h1>
                  <FavoriteButton size="md" item={{
                    id: show.id, type: "tv", title: show.name,
                    poster_path: show.poster_path, vote_average: show.vote_average,
                    first_air_date: show.first_air_date, addedAt: Date.now(),
                  }} />
                </div>

                <StatusButtons
                  id={show.id}
                  type="tv"
                  title={show.name}
                  poster_path={show.poster_path}
                  vote_average={show.vote_average}
                />

                {/* Meta row */}
                <div className="flex flex-wrap items-center gap-2 text-[13px]">
                  {show.first_air_date && (
                    <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                      {new Date(show.first_air_date).getFullYear()}
                      {(show as any).last_air_date && new Date((show as any).last_air_date).getFullYear() !== new Date(show.first_air_date).getFullYear()
                        ? " – " + new Date((show as any).last_air_date).getFullYear()
                        : ""}
                    </span>
                  )}
                  <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                    {show.number_of_seasons}{" "}{show.number_of_seasons === 1 ? "сезон" : show.number_of_seasons < 5 ? "сезона" : "сезонов"}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-foreground/[0.05] text-foreground/75 ring-1 ring-white/[0.06]">
                    {show.number_of_episodes}{" серий"}
                  </span>
                  <span className="px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-300 ring-1 ring-amber-500/25 font-semibold">
                    {"★ " + show.vote_average.toFixed(1)}
                  </span>
                </div>

                {show.overview && (
                  <ExpandableText
                    text={show.overview}
                    className="text-foreground/65 text-[13px] sm:text-[14px] leading-relaxed"
                  />
                )}

                {/* Action buttons — на мобиле full-width стек (h-11 rounded-xl),
                    на десктопе прежний ряд пилюль (sm:h-10 rounded-full). */}
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 pt-1">
                  <button
                    onClick={() => { openPlayerEp(false); scrollToPlayer(); }}
                    className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 sm:h-10 px-4 rounded-xl sm:rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90 transition-colors"
                  >
                    <Play size={15} fill="currentColor" /> {"Смотреть"}
                  </button>
                  {resumeTime && resumeTime > 10 && (
                    <button
                      onClick={() => { openPlayerEp(true); scrollToPlayer(); }}
                      className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 sm:h-10 px-4 rounded-xl sm:rounded-full bg-white/[0.06] ring-1 ring-white/15 text-foreground/90 text-[13px] font-semibold hover:bg-white/[0.12] transition-colors"
                    >
                      <Play size={15} fill="currentColor" /> {"Продолжить с " + formatTime(resumeTime)}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!requireAuth("Войдите, чтобы смотреть сериалы и сохранять прогресс")) return;
                      if (showPlayer) nextEpisode({ manual: true }); else { nextEpisode({ manual: true }); setShowPlayer(true); }
                      scrollToPlayer();
                    }}
                    className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 sm:h-10 px-4 rounded-xl sm:rounded-full bg-foreground/[0.06] ring-1 ring-white/[0.08] text-foreground/85 hover:bg-foreground/[0.1] transition-colors text-[13px] font-medium"
                  >
                    <SkipForward size={15} /> {"Следующая серия"}
                  </button>

                  {/* Скачивание и «Вместе» — Pro-фичи (любой Pro-источник, вкл.
                      Alloha). На мобиле 2-в-ряд, на десктопе sm:contents. */}
                  {isPro && (
                    <div className="grid grid-cols-2 gap-2 w-full sm:contents">
                      <MovieDownloadButton
                        type="tv"
                        show={{
                          id: show.id,
                          name: show.name,
                          poster_path: show.poster_path,
                          first_air_date: show.first_air_date,
                          number_of_seasons: show.number_of_seasons || 1,
                          seasons: (show as any).seasons,
                        }}
                        initialSeason={selectedSeason}
                        initialEpisode={selectedEpisode}
                      />
                      <Link
                        href={"/watch/create?q=" + encodeURIComponent(show.name) + "&id=" + show.id + "&type=tv&year=" + (show.first_air_date ? new Date(show.first_air_date).getFullYear() : "") + "&poster=" + (show.poster_path || "") + "&season=" + selectedSeason + "&episode=" + selectedEpisode}
                        className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 sm:h-10 px-3.5 rounded-xl sm:rounded-full bg-purple-500/12 ring-1 ring-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-colors text-[12.5px] font-semibold"
                        title="Смотреть вместе"
                      >
                        <Users size={14} /> {"Вместе"}
                      </Link>
                    </div>
                  )}
                </div>

                {/* Current episode + progress — скрыт на zenithjs (наш стейт не
                    отражает внутреннюю навигацию их плеера + прогресс не пишется). */}
                {!srcIsZenith && (() => {
                  const sp = getPosition(show.id, "tv", selectedSeason, selectedEpisode);
                  const epName = episodes.find(e => e.episode_number === selectedEpisode)?.name || "";
                  const progress = sp && sp.duration > 0 ? Math.min(100, (sp.time / sp.duration) * 100) : 0;
                  const remainingSec = sp && sp.duration > 0 ? Math.max(0, sp.duration - sp.time) : 0;
                  const remainingMin = Math.ceil(remainingSec / 60);
                  return (
                    <div className="pt-3 max-w-2xl">
                      <p className="text-foreground/85 text-[13px] font-semibold">
                        {"Сезон "}{selectedSeason}{", Серия "}{selectedEpisode}{epName ? ". " + epName : ""}
                      </p>
                      {progress > 0 && (
                        <>
                          <div className="mt-2 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all duration-500"
                              style={{ width: progress + "%" }}
                            />
                          </div>
                          <p className="mt-1.5 text-foreground/50 text-[11px] text-right">{"Осталось " + remainingMin + " мин"}</p>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>
            </section>
            </div>

            {/* Player options (Озвучка / Субтитры / Качество / Скорость) moved INTO the ArtPlayer
                settings menu (gear icon, bottom-right of the player). На ТВ + Вместе are above
                next to "Смотреть". */}

            {/* === EPISODES SECTION === (скрыт на zenithjs: там навигация только
                внутри их плеера, наш список рассинхронизировался бы) */}
            {validSeasons.length > 0 && !srcIsZenith && (
              <section className="order-4 mt-10">
                <h2 className="text-2xl font-bold text-foreground tracking-tight mb-4">{"Эпизоды"}</h2>

                {/* Озвучка selector — prominent, like HDRezka: pick a dub and the
                    season/episode lists below update to exactly what THAT dub has,
                    so it's obvious why some seasons appear/disappear. */}
                {translators.length > 0 && (
                  <div className="mb-5">
                    <div className="text-[13px] font-semibold text-foreground/50 mb-2 flex items-center gap-2">
                      {"Озвучка"}
                      {translatorLoading && (
                        <span className="inline-block h-3 w-3 rounded-full border-2 border-primary/40 border-t-primary animate-spin" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {Array.from(new Map(translators.map(t => [t.id, t])).values()).map((t) => (
                        <button
                          key={t.id}
                          onClick={() => changeTranslator(t.id)}
                          className={"flex-shrink-0 inline-flex items-center gap-1.5 h-9 px-4 rounded-full text-[13px] transition-colors " + (
                            selectedTranslator === t.id
                              ? "bg-primary/15 text-primary ring-1 ring-primary/30 font-semibold"
                              : "bg-foreground/[0.04] text-foreground/65 ring-1 ring-white/[0.06] hover:bg-foreground/[0.07] hover:text-foreground"
                          )}
                        >
                          {t.name}
                          {t.is_premium && (
                            <span className="text-[9px] font-bold px-1 rounded bg-amber-400/20 text-amber-300 leading-none py-0.5">PRO</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Season tabs (scoped to the selected озвучка) */}
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {gatedSeasons.map((s) => (
                    <button
                      key={s.season_number}
                      onClick={() => selectEpisode(s.season_number, 1)}
                      className={"flex-shrink-0 inline-flex items-center h-9 px-4 rounded-full text-[13px] transition-colors " + (
                        selectedSeason === s.season_number
                          ? "bg-primary/15 text-primary ring-1 ring-primary/30 font-semibold"
                          : "bg-foreground/[0.04] text-foreground/65 ring-1 ring-white/[0.06] hover:bg-foreground/[0.07] hover:text-foreground"
                      )}
                    >
                      {"Сезон "}{s.season_number}
                    </button>
                  ))}
                </div>

                {/* Horizontal episode scroller */}
                <div className="relative">
                  <div
                    id="ep-scroller"
                    className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory -mx-1 px-1"
                    style={{ scrollbarWidth: "thin" }}
                  >
                    {loadingEpisodes && episodes.length === 0 ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="snap-start flex-shrink-0 w-[200px] aspect-[16/10] rounded-xl bg-foreground/[0.04] animate-pulse" />
                      ))
                    ) : gatedEpisodes.map((ep) => {
                      const released = !ep.air_date || new Date(ep.air_date) <= new Date();
                      const active = ep.episode_number === selectedEpisode;
                      const stillUrl = ep.still_path ? getImageUrl(ep.still_path, "w300") : null;
                      return (
                        <button
                          key={ep.episode_number}
                          onClick={() => { if (released) { selectEpisode(selectedSeason, ep.episode_number); scrollToPlayer(); } }}
                          disabled={!released}
                          className="snap-start flex-shrink-0 w-[200px] text-left group disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <div className={"relative aspect-[16/10] rounded-xl overflow-hidden ring-2 transition-all duration-200 " + (
                            active
                              ? "ring-primary shadow-lg shadow-primary/30"
                              : "ring-white/[0.06] group-hover:ring-white/15"
                          )}>
                            {stillUrl ? (
                              <img src={stillUrl} alt={ep.name || ""} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-foreground/[0.04] flex items-center justify-center">
                                <Film size={22} className="text-foreground/30" />
                              </div>
                            )}
                            <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/65 backdrop-blur text-white text-[11px] font-bold leading-none ring-1 ring-white/15 flex items-center h-5">
                              {ep.episode_number}
                            </div>
                            {!released && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-white/80 text-xs">
                                {"🔒 " + (ep.air_date ? new Date(ep.air_date).toLocaleDateString("ru-RU") : "")}
                              </div>
                            )}
                          </div>
                          <div className={"mt-2 px-0.5 " + (active ? "text-primary" : "text-foreground/85")}>
                            <p className="text-[13px] font-semibold leading-tight line-clamp-1">
                              {ep.name || ("Серия " + ep.episode_number)}
                            </p>
                            {ep.runtime > 0 && (
                              <p className="text-foreground/50 text-[11px] mt-0.5">{ep.runtime}{" мин"}</p>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Scroll arrows */}
                  <button
                    aria-label="Back"
                    onClick={() => { const el = document.getElementById("ep-scroller"); if (el) el.scrollBy({ left: -700, behavior: "smooth" }); }}
                    className="hidden sm:flex absolute left-0 top-[40%] -translate-y-1/2 -translate-x-2 w-9 h-9 rounded-full bg-background/85 ring-1 ring-white/15 backdrop-blur items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background z-10 shadow-lg"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    aria-label="Next"
                    onClick={() => { const el = document.getElementById("ep-scroller"); if (el) el.scrollBy({ left: 700, behavior: "smooth" }); }}
                    className="hidden sm:flex absolute right-0 top-[40%] -translate-y-1/2 translate-x-2 w-9 h-9 rounded-full bg-background/85 ring-1 ring-white/15 backdrop-blur items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background z-10 shadow-lg"
                  >
                    <ChevronRight size={18} />
                  </button>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
