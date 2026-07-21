"use client";

import type { MovieDetails } from "@/lib/tmdb";
import { MovieDownloadButton } from './movie-download-button';
import {
  Play, Film, ChevronDown, Mic, Clock, CalendarDays, Users,
  Tv as TvIcon, Subtitles, Maximize, Star, Download, Bookmark,
} from "lucide-react";
import { getImageUrl } from "@/lib/tmdb";
import Link from "next/link";
import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import Hls from "hls.js";
import { FavoriteButton } from "./favorite-button";
import { StatusButtons } from "./status-buttons";
import { ExpandableText } from "./expandable-text";
import { TrailerButton } from "./trailer-modal";
import { useAuthGate } from "./auth-gate";
import { SkipOverlays } from "./skip-overlays";
import { savePosition, getPosition, addToHistory, saveLastTranslator, getLastTranslator, recordTranslatorTry } from "@/lib/storage";
import { watchHeartbeat } from "@/lib/metrika";
import { pickDefaultQuality, setQualityPref } from "@/lib/quality";
import { hlsProxyUrl } from "@/lib/quality-probe";
import { warmStream } from "@/lib/stream-warm";
import { ArtPlayerView, type ArtSubtitle } from "./art-player";
import { getSource, resolveKinopub, resolveZenithEmbed, resolveIframeEmbed, isIframeSource, resolveAllohaHls, resolveFilmix, pickAllohaStream, playerLabel, HDREZKA_UP, type AllohaHls } from "@/lib/kinopub";
import { ProUpsell } from "./pro-upsell";
import { PlayerSwitcher } from "./player-switcher";
import { PreRollAd } from "./pre-roll-ad";
import { useSubscription } from "@/hooks/use-subscription";

// Пре-ролл реклама для free-тарифа (nginx-статика, вне Next). Путь НЕ /ads/ —
// иначе блокировщики рекламы режут его → чёрный экран. /media/ они не трогают.
// Последовательность: сначала короткий непропускаемый ролик, потом длинный с
// пропуском через 5с. Порядок/список менять тут.
const AD_SEQUENCE = [
  { src: "/media/intro2.mp4", skippable: true },
  { src: "/media/oldspice.mp4", skippable: false },
];

interface MoviePlayerProps {
  movie: MovieDetails;
}

interface Translator {
  id: number;
  name: string;
  is_premium?: boolean;
}

export function MoviePlayer({ movie }: MoviePlayerProps) {
  const requireAuth = useAuthGate();
  const [showPlayer, setShowPlayer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showLoadingMascot, setShowLoadingMascot] = useState(false);
  const [error, setError] = useState("");
  const [streamData, setStreamData] = useState<any>(null);
  // Free (zenithjs) по умолчанию → init true, чтобы SSR/первый рендер сразу
  // скрывали платные кнопки (скачать/вместе) без мелькания.
  const [srcIsZenith, setSrcIsZenith] = useState(true);
  // Реальный бесплатный тариф = ТОЛЬКО zenithjs. Alloha — тоже iframe, но это
  // Про-источник (админ-тест), поэтому фри-апселл на ней показывать НЕЛЬЗЯ.
  const [srcIsFree, setSrcIsFree] = useState(true);
  // Тариф: free (не Pro) → плеер Alloha + пре-ролл; Pro → без рекламы.
  const { isPro, loading: subLoading } = useSubscription();
  const isProRef = useRef(isPro);
  useEffect(() => { isProRef.current = isPro; }, [isPro]);
  // Реклама показана/пропущена в этой сессии страницы (гейтит контент).
  const [adDone, setAdDone] = useState(false);
  // Alloha нативно: резолвнутые озвучки+качества (VK m3u8 через наш прокси).
  const [allohaHls, setAllohaHls] = useState<AllohaHls | null>(null);
  const [allohaTr, setAllohaTr] = useState(0);
  const [allohaQ, setAllohaQ] = useState("1080");
  const allohaTranslators = useMemo(
    () => (allohaHls?.translations || []).map((t, i) => ({ id: i, name: t.name })),
    [allohaHls],
  );
  // Нативный резолв Alloha ИЛИ Filmix (форма ответа одинаковая, плеер общий).
  const resolveAllohaNative = useCallback(async (): Promise<boolean> => {
    let a: AllohaHls | null;
    let defQ = "1080";
    if (getSource() === "filmix") {
      const yr = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
      a = await resolveFilmix(movie.title || "", yr, "movie", (movie as any).original_title);
      defQ = "1080p";
    } else {
      a = await resolveAllohaHls(movie.id, "movie");
    }
    if (!a) return false;
    const pick = pickAllohaStream(a, 0, defQ);
    if (!pick) return false;
    setAllohaHls(a); setAllohaTr(0); setAllohaQ(pick.quality);
    setStreamData({ stream: pick.url, alloha: true });
    return true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);
  useEffect(() => {
    const check = () => { setSrcIsZenith(isIframeSource()); setSrcIsFree(getSource() === "zenithjs"); };
    check();
    // Источник сменился (энфорсер free→alloha, либо переключатель) и просмотр
    // ещё не начат → пере-резолвим iframe-embed под новый источник, чтобы free
    // реально попал на Alloha, а не на устаревший zenithjs с первого рендера.
    const onSourceChange = () => {
      check();
      if (startedRef.current) return;
      if ((getSource() === "alloha" || getSource() === "filmix")) {
        setStreamData(null);
        resolveAllohaNative();
      } else if (isIframeSource()) {
        setStreamData(null);
        resolveIframeEmbed(movie.id, "movie", undefined, undefined, { allohaFallbackToZenith: !isProRef.current })
          .then((embed) => { if (embed && !startedRef.current) setStreamData({ collaps: true, collapsEmbed: embed }); });
      }
    };
    window.addEventListener("kino-source-changed", onSourceChange);
    window.addEventListener("storage", check);
    return () => { window.removeEventListener("kino-source-changed", onSourceChange); window.removeEventListener("storage", check); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);
  // Position to start the next source switch at — set on a quality switch so the
  // new stream begins where playback is, not at 0.
  const [seekOnSwitch, setSeekOnSwitch] = useState<number | undefined>(undefined);
  const [selectedQuality, setSelectedQuality] = useState("");
  const [cssFullscreen, setCssFullscreen] = useState(false);
  // ArtPlayer container — once captured, SkipOverlays portals into it so
  // they stay visible in every fullscreen mode (web/native/mobile).
  const [playerContainer, setPlayerContainer] = useState<HTMLElement | null>(null);
  const [resumeTime, setResumeTime] = useState<number | null>(null);
  const [showResume, setShowResume] = useState(false);
  // "Смотреть" starts from 0; "Продолжить просмотр" is the ONLY thing that
  // seeks to the saved position. wantResume gates the auto-seek so the main
  // play button never does the jarring load-from-0-then-jump.
  const [wantResume, setWantResume] = useState(false);
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [selectedTranslator, setSelectedTranslator] = useState<number | null>(null);
  const [showTranslators, setShowTranslators] = useState(false);
  const [translatorLoading, setTranslatorLoading] = useState(false);
  const [subtitles, setSubtitles] = useState<ArtSubtitle[]>([]);
  const [selectedSubtitleId, setSelectedSubtitleId] = useState<string | null>(null);
  // Available quality + dub count, surfaced from the prefetch so the user sees
  // "1080p · N озвучек" before pressing play (no extra request).
  const [availInfo, setAvailInfo] = useState<{ quality?: string; dubs?: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInterval = useRef<any>(null);
  const translatorRef = useRef<HTMLDivElement>(null);
  const subsFetchedRef = useRef(false);
  // Warmed HDRezka resolve — populated on mount so clicking "Смотреть" plays
  // instantly instead of waiting ~2s. fetchStream reuses this exact in-flight
  // request when the URL matches (no duplicate call).
  const prefetchRef = useRef<{ url: string; promise: Promise<any> } | null>(null);
  // True once the user actually pressed play — gates the (async) pre-warm probe
  // from clobbering the stream the click already started resolving.
  const startedRef = useRef(false);
  // Плеер теперь под блоком инфо — по «Смотреть» прокручиваем к нему.
  const playerRef = useRef<HTMLDivElement>(null);
  const scrollToPlayer = () => {
    requestAnimationFrame(() => playerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const fetchSubtitles = useCallback(async () => {
    if (subsFetchedRef.current) return;
    subsFetchedRef.current = true;
    try {
      const res = await fetch(`/api/subtitles?tmdb=${movie.id}`);
      const data = await res.json();
      setSubtitles(data.subs || []);
    } catch {
      setSubtitles([]);
    }
  }, [movie.id]);

  const isNotReleased = movie.release_date ? new Date(movie.release_date) > new Date() : false;
  const releaseStr = movie.release_date ? new Date(movie.release_date).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" }) : "";

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
    const pos = getPosition(movie.id, "movie");
    if (pos && pos.time > 10) {
      setResumeTime(pos.time);
    }
    const lastTr = getLastTranslator(movie.id, "movie");
    if (lastTr) setSelectedTranslator(lastTr.id);
  }, [movie.id]);

  // Prefetch the stream on mount so "Смотреть" is instant. Built to match the
  // exact URL fetchStream uses for its primary search (same title/year/dub),
  // so fetchStream consumes this in-flight request instead of firing a new one.
  useEffect(() => {
    if (isNotReleased) return;
    let alive = true;
    // Collaps (=LordFilm) source: resolve the iframe embed URL (their own player).
    // No pre-buffering — the iframe loads on play. We just resolve the URL early.
    // Alloha — нативный резолв (VK m3u8 в наш ArtPlayer).
    if ((getSource() === "alloha" || getSource() === "filmix")) {
      (async () => { if (alive) await resolveAllohaNative(); })();
      return () => { alive = false; };
    }
    if (isIframeSource()) {
      (async () => {
        const embed = await resolveIframeEmbed(movie.id, "movie", undefined, undefined, { allohaFallbackToZenith: !isProRef.current });
        if (alive && embed) setStreamData({ collaps: true, collapsEmbed: embed });
      })();
      return () => { alive = false; };
    }
    // kino.pub source: prewarm via the resolver worker (single adaptive hls4)
    // instead of HDRezka, so the hidden player buffers the right stream.
    if (getSource() === "kinopub") {
      (async () => {
        const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
        const kpTitle = ((movie.title || (movie as any).original_title || "") as string).replace(/["«»""]/g, "").trim();
        if (!kpTitle) return;
        const kp = await resolveKinopub({ tmdbId: movie.id, title: kpTitle, otitle: movie.original_title, year, type: "movie" });
        if (!alive || !kp) return;
        setAvailInfo({ quality: (kp.qualities && kp.qualities[0]) || "HD", dubs: 0 });
        const c: any = (navigator as any).connection;
        const fast = !c || (!c.saveData && c.type !== "cellular" && c.effectiveType !== "2g" && c.effectiveType !== "slow-2g" && c.effectiveType !== "3g");
        if (fast && !startedRef.current) setStreamData({ stream: kp.hls4, kinopub: true, quality: "Auto" });
      })();
      return () => { alive = false; };
    }
    try {
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
      const ruTitle = (movie.title || "").replace(/["«»""]/g, "").trim();
      const origTitle = ((movie as any).original_title || "").replace(/["«»""]/g, "").trim();
      const searchTitle = ruTitle || origTitle;
      if (!searchTitle) return;
      const tr = getLastTranslator(movie.id, "movie")?.id ?? null;
      const q = encodeURIComponent(searchTitle);
      // Also pass the original title so the backend can disambiguate generic
      // RU titles that HDRezka mis-resolves ("Страх"/Fear 1996 → wrongly
      // "Первобытный страх"). Backend only pays the extra search when the RU
      // hit isn't exact.
      const origParam = (origTitle && origTitle !== searchTitle) ? "&orig=" + encodeURIComponent(origTitle) : "";
      // Top cast names — last-resort disambiguator for same-year namesakes the
      // title can't separate. Backend only uses it when the pick is ambiguous.
      const castNames = (((movie as any).credits?.cast) || []).slice(0, 6).map((c: any) => c?.name).filter(Boolean).join(",");
      const castParam = castNames ? "&cast=" + encodeURIComponent(castNames) : "";
      const trParam = tr ? "&translator_id=" + tr : "";
      const url = "/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie" + origParam + castParam + trParam;
      const p = fetch(url).then((r) => r.json()).catch(() => null);
      prefetchRef.current = { url, promise: p };
      p.then((d: any) => {
        if (!alive || !d?.stream) return;
        setAvailInfo({ quality: d.quality, dubs: (d.translators || []).length });
        // Warm the CDN connection + manifest the moment the page opens.
        warmStream(d.stream);
        // Pre-buffer the player (mounts hidden) so play is instant — gated to
        // fast connections so we don't pre-pull video on mobile. Everything
        // plays through the LeadSeek proxy (applyStream), so there's no throttle
        // lottery and no speed probe needed.
        const c: any = (navigator as any).connection;
        const fast = !c || (!c.saveData && c.type !== "cellular" &&
          c.effectiveType !== "2g" && c.effectiveType !== "slow-2g" && c.effectiveType !== "3g");
        if (fast && !isNotReleased && !startedRef.current) applyStream(d);
      });
    } catch {}
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id]);

  // Same stale-closure trap as tv-player. Quality/translator changes mid-play
  // would otherwise keep writing the OLD label into history because the
  // interval captured them at startSaving time.
  const ctxRef = useRef({ quality: selectedQuality, translatorId: selectedTranslator, translators });
  useEffect(() => {
    ctxRef.current = { quality: selectedQuality, translatorId: selectedTranslator, translators };
  }, [selectedQuality, selectedTranslator, translators]);

  const startSaving = useCallback(() => {
    if (saveInterval.current) clearInterval(saveInterval.current);
    saveInterval.current = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        const ct = videoRef.current.currentTime;
        const dur = videoRef.current.duration;
        if (ct > 0 && dur > 0) {
          const ctx = ctxRef.current;
          watchHeartbeat();
          savePosition(movie.id, "movie", ct, dur);
          const trName = ctx.translators.find(t => t.id === ctx.translatorId)?.name || "";
          addToHistory({
            id: movie.id, type: "movie", title: movie.title,
            poster_path: movie.poster_path, vote_average: movie.vote_average,
            release_date: movie.release_date, watchedAt: Date.now(),
            progress: ct, duration: dur, quality: ctx.quality,
            translatorName: trName, translatorId: ctx.translatorId || undefined,
            genre_ids: movie.genres?.map(g => g.id),
          });
        }
      }
    }, 5000);
  }, [movie]);

  useEffect(() => {
    return () => { if (saveInterval.current) clearInterval(saveInterval.current); };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (videoRef.current) {
        savePosition(movie.id, "movie", videoRef.current.currentTime, videoRef.current.duration);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [movie.id]);

  // iframe-источники (Alloha/Collaps/zenithjs) — их плеер чёрный ящик, событий
  // от <video> нет, поэтому история/позиция не писались (не появлялось в
  // «продолжить смотреть», не считались часы). Оцениваем просмотр по РЕАЛЬНОМУ
  // времени, что iframe открыт (≈ время просмотра), и пишем историю+позицию.
  // Точную докрутку внутри держит сам их плеер (свой сторедж по домену).
  useEffect(() => {
    if (!showPlayer || !streamData?.collapsEmbed) return;
    const durSec = ((movie as any)?.runtime > 0 ? (movie as any).runtime : 90) * 60;
    const startedAt = Date.now();
    const write = () => {
      const elapsed = Math.min((Date.now() - startedAt) / 1000, durSec - 1);
      if (elapsed < 10) return;
      watchHeartbeat();
      savePosition(movie.id, "movie", elapsed, durSec);
      addToHistory({
        id: movie.id, type: "movie", title: movie.title, poster_path: movie.poster_path,
        vote_average: movie.vote_average, release_date: movie.release_date, watchedAt: Date.now(),
        progress: elapsed, duration: durSec, genre_ids: movie.genres?.map((g) => g.id),
      });
    };
    const iv = setInterval(write, 20000);
    return () => { clearInterval(iv); write(); };
  }, [showPlayer, streamData?.collapsEmbed, movie]);

  // Apply a fetched resolve with the smart default quality (connection-aware +
  // remembered manual choice) instead of the backend's raw max.
  const applyStream = (d: any) => {
    const sq = pickDefaultQuality(d.streams, d.quality);
    // Everything plays through the LeadSeek proxy — it has a fast route to every
    // CDN edge, so there's no per-route throttle "lottery" on any quality/dub.
    const url = sq && d.streams?.[sq] ? hlsProxyUrl(d.streams[sq]) : d.stream;
    setStreamData(sq && d.streams?.[sq] ? { ...d, stream: url, quality: sq } : d);
    setSelectedQuality(sq || d.quality);
    // Populate the dub list here too — the pre-warm path (mount on open) sets the
    // stream via applyStream but NOT through fetchStream, so without this the
    // "Озвучка" menu was empty / showed a single dub.
    if (d.translators?.length) {
      setTranslators(d.translators);
      setSelectedTranslator((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
    }
  };

  const fetchStream = async (translatorId?: number | null, _attempt = 0) => {
    if (isNotReleased) return;
    setLoading(true);
    setError("");
    let retrying = false; // when true, the finally skips clearing loading

    // Zenithjs source — resolve the iframe embed (их плеер сам держит озвучки).
    // НЕ гейтим по translatorId (иначе падало бы в HDRezka).
    // Alloha — нативный резолв в наш ArtPlayer.
    if ((getSource() === "alloha" || getSource() === "filmix") && _attempt === 0) {
      const ok = await resolveAllohaNative();
      if (!ok) setError(`Недоступно на ${playerLabel(getSource())} — попробуйте другой плеер.`);
      setLoading(false);
      return;
    }
    if (isIframeSource() && _attempt === 0) {
      try {
        const embed = await resolveIframeEmbed(movie.id, "movie", undefined, undefined, { allohaFallbackToZenith: !isProRef.current });
        if (embed) { setStreamData({ collaps: true, collapsEmbed: embed }); setLoading(false); return; }
      } catch {}
      setError("Этого фильма нет на бесплатном источнике. Он доступен по подписке Про.");
      setLoading(false);
      return;
    }

    // kino.pub source (profile toggle) — resolve to ONE adaptive hls4 (all
    // dubs+qualities in the manifest; player switches via hls.js, no re-resolve).
    // Only on the initial resolve (dub switches happen inside the player). Soft
    // fallback: if kino.pub doesn't have the title, drop through to HDRezka.
    if (getSource() === "kinopub" && _attempt === 0 && translatorId == null) {
      try {
        const kpYear = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
        const kpTitle = ((movie.title || (movie as any).original_title || "") as string).replace(/["«»""]/g, "").trim();
        const kp = await resolveKinopub({ tmdbId: movie.id, title: kpTitle, otitle: movie.original_title, year: kpYear, type: "movie" });
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
    // sets selectedTranslator state; without this the backend gets no
    // translator_id and returns the default dub even though the label says
    // "saved translator".
    const effectiveTr = translatorId ?? selectedTranslator ?? getLastTranslator(movie.id, "movie")?.id ?? null;
    if (effectiveTr && effectiveTr !== selectedTranslator) setSelectedTranslator(effectiveTr);
    if (!effectiveTr) setStreamData(null);
    try {
      const year = movie.release_date ? new Date(movie.release_date).getFullYear() : "";
      // HDRezka indexes Russian titles primarily — searching by the English
      // `original_title` fails for Russian-language productions ("Normal" → no
      // hit, "Нормал" → match). Use the localized title first, fall back to
      // original only if the search returns nothing.
      const origTitle = ((movie as any).original_title || "").replace(/["«»""]/g, "").trim();
      const ruTitle = (movie.title || "").replace(/["«»""]/g, "").trim();
      const searchTitle = ruTitle || origTitle;
      const q = encodeURIComponent(searchTitle);
      const origParam = (origTitle && origTitle !== searchTitle) ? "&orig=" + encodeURIComponent(origTitle) : "";
      const castNames = (((movie as any).credits?.cast) || []).slice(0, 6).map((c: any) => c?.name).filter(Boolean).join(",");
      const castParam = castNames ? "&cast=" + encodeURIComponent(castNames) : "";
      const trParam = effectiveTr ? "&translator_id=" + effectiveTr : "";
      const url = "/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie" + origParam + castParam + trParam;
      // Reuse the warmed prefetch when it matches (instant play); otherwise fetch.
      let data: any = null;
      if (prefetchRef.current && prefetchRef.current.url === url) {
        data = await prefetchRef.current.promise;
        prefetchRef.current = null;
      }
      if (!data) {
        const res = await fetch(url);
        data = await res.json();
      }
      if (data.stream) {
        // What dub is ACTUALLY playing? Trust the backend's
        // active_translator_id, NOT effectiveTr — they diverge when HDRezka
        // substitutes a premium dub (whose stream is a 60-sec "buy
        // subscription" pre-roll). Using effectiveTr hid the substitution.
        const actualId: number | undefined = data.active_translator_id ?? data.translators?.[0]?.id;
        const actualIsPremium = !!data.translators?.find((t: any) => t.id === actualId)?.is_premium;
        const requestedId = effectiveTr;
        const substituted = requestedId != null && actualId != null && requestedId !== actualId;
        const freeAlt = data.translators?.find((t: any) => !t.is_premium && t.id !== requestedId);

        // First play / no explicit pick: if the default is a premium stub,
        // silently switch to a free dub.
        if (!translatorId && actualIsPremium && freeAlt) {
          setTranslators(data.translators);
          setSelectedTranslator(freeAlt.id);
          saveLastTranslator(movie.id, "movie", freeAlt.id, freeAlt.name);
          return fetchStream(freeAlt.id);
        }

        // Requested dub got substituted with a premium stub — don't play it.
        if (substituted && actualIsPremium) {
          if (data.translators?.length) setTranslators(data.translators);
          setStreamData(null);
          setError("Этот фильм в выбранной озвучке доступен только по подписке. Выберите другую озвучку.");
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
        const activeId = effectiveTr ?? data.active_translator_id ?? data.translators?.[0]?.id;
        const activeName = data.translators?.find((t: any) => t.id === activeId)?.name;
        if (activeName) recordTranslatorTry(activeName);
        return;
      }
      if (data.results && data.results.length > 0) {
        for (let i = 0; i < Math.min(data.results.length, 5); i++) {
          const res2 = await fetch("/hdrezka/api/search?q=" + q + "&year=" + year + "&type=movie&index=" + i + trParam);
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
      }
      // Fallback: if our primary (Russian) title returned nothing, retry with
      // original_title. Covers titles HDRezka indexes only in English.
      if (origTitle && origTitle !== ruTitle) {
        const q2 = encodeURIComponent(origTitle);
        const resAlt = await fetch("/hdrezka/api/search?q=" + q2 + "&year=" + year + "&type=movie" + trParam);
        const dataAlt = await resAlt.json();
        if (dataAlt.stream) {
          applyStream(dataAlt);
          if (dataAlt.translators && dataAlt.translators.length > 0 && translators.length === 0) {
            setTranslators(dataAlt.translators);
            if (!selectedTranslator) setSelectedTranslator(dataAlt.active_translator_id ?? dataAlt.translators[0].id);
          }
          return;
        }
      }
      // Auto-retry once before giving up — covers transient HDRezka blips so
      // the user doesn't have to reload the page.
      if (_attempt < 1) { retrying = true; await new Promise(r => setTimeout(r, 800)); return fetchStream(translatorId, _attempt + 1); }
      setError("Фильм пока недоступен для просмотра");
    } catch {
      if (_attempt < 1) { retrying = true; await new Promise(r => setTimeout(r, 800)); return fetchStream(translatorId, _attempt + 1); }
      setError("Сервер не отвечает");
    } finally {
      if (!retrying) { setLoading(false); setTranslatorLoading(false); }
    }
  };

  const changeTranslator = async (trId: number) => {
    if (trId === selectedTranslator) { setShowTranslators(false); return; }
    setSelectedTranslator(trId);
    const trName = translators.find(t => t.id === trId)?.name || "";
    saveLastTranslator(movie.id, "movie", trId, trName);
    setShowTranslators(false);
    setTranslatorLoading(true);
    // Resume at the current position once the new dub's stream loads — via the
    // same reliable seekOnSwitch path the quality switch uses (the old fixed
    // 500ms seek fired before the proxied stream was ready → restarted at 0).
    const currentTime = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(currentTime > 1 ? currentTime : undefined);
    await fetchStream(trId);
  };

  // Alloha: смена озвучки/качества = свап уже резолвнутого VK m3u8 (без ре-резолва).
  const changeAllohaTranslator = (i: number) => {
    if (!allohaHls || i === allohaTr) return;
    const pick = pickAllohaStream(allohaHls, i, allohaQ);
    if (!pick) return;
    const pos = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(pos > 1 ? pos : undefined);
    setAllohaTr(i); setAllohaQ(pick.quality);
    setStreamData((prev: any) => (prev ? { ...prev, stream: pick.url } : prev));
  };
  const changeAllohaQuality = (q: string) => {
    if (!allohaHls) return;
    const pick = pickAllohaStream(allohaHls, allohaTr, q);
    if (!pick) return;
    const pos = videoRef.current?.currentTime || 0;
    setSeekOnSwitch(pos > 1 ? pos : undefined);
    setAllohaQ(pick.quality);
    setStreamData((prev: any) => (prev ? { ...prev, stream: pick.url } : prev));
  };

  // HLS loading + recovery + visibilitychange resume live inside ArtPlayerView now.
  useEffect(() => {
    if (!streamData?.stream) return;
    if (resumeTime && resumeTime > 10 && !translatorLoading) setShowResume(true);
  }, [streamData, resumeTime, translatorLoading]);

  // Min-show маскота 800ms — гарантия что не моргнёт
  useEffect(() => {
    if (loading) { setShowLoadingMascot(true); return; }
    const t = setTimeout(() => setShowLoadingMascot(false), 800);
    return () => clearTimeout(t);
  }, [loading]);

  // Open the player. resume=false → start from 0 ("Смотреть"); resume=true →
  // seek to the saved position ("Продолжить просмотр").
  const openPlayer = (resume: boolean) => {
    if (isNotReleased) return;
    if (!requireAuth("Войдите, чтобы смотреть фильмы и сохранять прогресс")) return;
    startedRef.current = true;
    setWantResume(resume);
    if (resume && resumeTime && videoRef.current) videoRef.current.currentTime = resumeTime;
    setShowPlayer(true);
    // Start the (pre-warmed) video WITHIN this tap gesture. Relying only on the
    // async autoStart effect lost the gesture on mobile, so autoplay was blocked
    // and ArtPlayer showed its OWN poster + play button on top of ours — the
    // "two play buttons, tap again to dismiss" bug. Playing here (muted fallback)
    // starts it on the first tap.
    const v = videoRef.current;
    if (v && streamData?.stream) {
      const p = v.play();
      if (p && typeof p.catch === "function") p.catch(() => { try { v.muted = true; v.play().catch(() => {}); } catch {} });
    }
    // If the player was already pre-warmed (streamData set on open), revealing it
    // flips autoStart → the player starts the buffered video instantly. Only do a
    // cold resolve when nothing is prewarmed yet.
    if (!streamData?.stream && !streamData?.collapsEmbed) fetchStream();
  };

  const handleResume = () => {
    if (videoRef.current && resumeTime) {
      videoRef.current.currentTime = resumeTime;
    }
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
    // resetting to 0, then only re-assert play if it sneaks in a pause — NEVER
    // touch currentTime here, or we'd fight a forward seek made right after.
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

  const toggleFullscreen = () => {
    const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);
    const isTelegram = !!(window as any).Telegram?.WebApp;
    if (isTelegram) { try { (window as any).Telegram.WebApp.requestFullscreen(); } catch {} }
    if (!isMobile && !isTelegram && videoRef.current?.requestFullscreen) {
      videoRef.current.requestFullscreen().catch(() => setCssFullscreen(true));
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
    return h > 0 ? h + ":" + m.toString().padStart(2,"0") + ":" + sec.toString().padStart(2,"0") : m + ":" + sec.toString().padStart(2,"0");
  };

  const getTranslatorName = () => {
    if (!selectedTranslator || translators.length === 0) return "Озвучка";
    const t = translators.find(t => t.id === selectedTranslator);
    return t ? t.name : "Озвучка";
  };

  const backdropUrl = movie.backdrop_path
    ? "/tmdb-img/w1280" + movie.backdrop_path
    : movie.poster_path
      ? "/tmdb-img/w780" + movie.poster_path
      : null;

  return (
    <div className="relative w-full">
      {/* flex-col + order-* : блок инфо (order-1) идёт ПЕРВЫМ, плеер (order-2)
          и переключатель/апселл (order-3) — под ним. В фуллскрине плеер
          становится fixed и выпадает из потока, order там неважен. */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col">
        <div ref={playerRef} className={cssFullscreen
          ? "fixed inset-0 z-[9999] bg-black flex items-center justify-center"
          : "order-2 mt-8 aspect-video bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-black/50 border border-white/5 group"
        }>
          {/* Player mounts + pre-buffers as soon as the stream resolves
              (autoStart=false) HIDDEN behind the poster, so "Смотреть" plays
              instantly. interactive={showPlayer} keeps the pre-warmed player
              non-interactive (pointer-events:none) until the auth gate passes in
              openPlayer — otherwise unregistered users could tap the hidden
              player and bypass the gate. */}
          {streamData?.stream && (!streamData.alloha || isPro || adDone) && (
            <ArtPlayerView
              streamUrl={streamData.stream}
              poster={backdropUrl || undefined}
              kinopubMode={!!streamData.kinopub}
              qualities={streamData.alloha ? (allohaHls?.translations[allohaTr]?.quality) : (streamData.kinopub ? undefined : streamData.streams)}
              selectedQuality={streamData.alloha ? allohaQ : selectedQuality}
              onQualityChange={streamData.alloha ? changeAllohaQuality : changeQuality}
              translators={streamData.alloha ? allohaTranslators : (streamData.kinopub ? [] : translators)}
              selectedTranslator={streamData.alloha ? allohaTr : selectedTranslator}
              onTranslatorChange={streamData.alloha ? changeAllohaTranslator : changeTranslator}
              subtitles={subtitles}
              selectedSubtitleId={selectedSubtitleId}
              onSubtitleChange={setSelectedSubtitleId}
              onLoadSubtitles={fetchSubtitles}
              resumeTime={wantResume ? (resumeTime || undefined) : undefined}
              seekOnSwitch={seekOnSwitch}
              autoStart={showPlayer}
              interactive={showPlayer}
              onVideoReady={(v) => { videoRef.current = v; startSaving(); }}
              onVideoUnmount={() => { videoRef.current = null; if (saveInterval.current) clearInterval(saveInterval.current); }}
              onPlayerContainerReady={setPlayerContainer}
            />
          )}
          {/* Collaps (=LordFilm) — сторонний iframe-плеер (свои озвучки/качество).
              Раскрывается на «Смотреть». Наш ArtPlayer тут не участвует. */}
          {/* Контент-iframe: для Pro сразу, для free — ТОЛЬКО после пре-ролла
              (adDone). До этого src в DOM нет → рекламу не обойти. */}
          {showPlayer && streamData?.collapsEmbed && (isPro || adDone) && (
            <iframe
              key={streamData.collapsEmbed}
              src={streamData.collapsEmbed}
              className="absolute inset-0 w-full h-full border-0 z-10"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          )}
          {/* Пре-ролл реклама (free-тариф) — перед контентом (Alloha-нативно ИЛИ
              collaps-iframe). Ждём резолва подписки, чтобы не мигнуть Pro-юзеру. */}
          {showPlayer && (streamData?.collapsEmbed || streamData?.alloha) && !isPro && !subLoading && !adDone && (
            <PreRollAd ads={AD_SEQUENCE} onDone={() => setAdDone(true)} />
          )}
          {streamData?.stream && showPlayer && (
            <SkipOverlays videoRef={videoRef} playerContainer={playerContainer} tmdbId={movie.id} type="movie" />
          )}
          {streamData?.stream && showPlayer && translatorLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
                <p className="text-white text-sm">Смена озвучки...</p>
              </div>
            </div>
          )}

          {/* Loading mascot / error — only after play was pressed and the stream
              isn't ready yet (cold start / slow connection). */}
          {showPlayer && !streamData?.stream && error ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4 px-8 overflow-y-auto py-8">
              <Clock size={48} className="text-gray-500" />
              <p className="text-gray-300 text-center text-lg">{error}</p>
              {translators.length > 1 ? (
                <div className="w-full max-w-sm">
                  <p className="text-[11px] uppercase tracking-wider text-white/45 font-semibold mb-2 text-center">Выберите озвучку</p>
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                    {Array.from(new Map(translators.map(t => [t.id, t])).values()).map(t => (
                      <button
                        key={t.id}
                        onClick={() => { setError(""); fetchStream(t.id); }}
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
              ) : (
                <p className="text-gray-500 text-center text-sm">Попробуйте позже или выберите другой фильм</p>
              )}
              <button onClick={() => fetchStream()} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl font-medium transition-colors">Попробовать снова</button>
            </div>
          ) : showPlayer && !streamData?.stream && !streamData?.collapsEmbed && (loading || showLoadingMascot) ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-black text-white gap-4">
              <div className="w-12 h-12 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
              <p className="text-[15px] font-medium text-white/85">{translatorLoading ? "Смена озвучки..." : "Загрузка фильма"}</p>
            </div>
          ) : null}

          {/* Poster overlay — covers the (pre-buffering) player until play. */}
          {!showPlayer && (
            <div className="absolute inset-0 z-30 cursor-pointer group/play" onClick={() => openPlayer(false)}>
              {backdropUrl && <img src={backdropUrl} alt={movie.title} className={"absolute inset-0 w-full h-full " + (movie.backdrop_path ? "object-cover" : "object-contain bg-black/90")} />}
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-t from-black via-black/30 to-black/10">
                <div className="flex flex-col items-center gap-5">
                  {isNotReleased ? (
                    <>
                      <div className="w-24 h-24 rounded-full bg-gray-700/90 flex items-center justify-center shadow-xl">
                        <CalendarDays size={44} className="text-gray-300" />
                      </div>
                      <div className="text-center">
                        <p className="text-white/90 text-lg font-semibold">{"\u0421\u043A\u043E\u0440\u043E \u0432 \u043A\u0438\u043D\u043E"}</p>
                        <p className="text-white/50 text-sm mt-1">{"Дата выхода: " + releaseStr}</p>
                      </div>
                    </>
                  ) : (
                    <div className="w-20 h-20 rounded-full bg-white/90 flex items-center justify-center shadow-xl shadow-black/40 transition-transform duration-300 group-hover:scale-110">
                      <Play size={38} className="text-black ml-1" fill="currentColor" />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Переключатель плеера (Про) — под плеером, не поверх видео. */}
        {!cssFullscreen && <div className="order-3"><PlayerSwitcher /></div>}

        {/* Апселл на Про — под бесплатным (zenithjs) плеером */}
        {!isPro && !subLoading && !cssFullscreen && <div className="order-3"><ProUpsell /></div>}

        {!cssFullscreen && (
          <>
            {/* === INFO CARD === (order-1: над плеером). overflow-visible, чтобы
                выпадашка «Скачать» не обрезалась краем карточки; скругление
                бэкдропа делает внутренний слой (rounded-3xl overflow-hidden). */}
            <div className="order-1 relative rounded-3xl ring-1 ring-white/[0.07]">
              {/* Кино-бэкдроп за блоком инфо (для красоты). Затемнён градиентом,
                  чтобы текст оставался контрастным. Игнорируем клики. */}
              {backdropUrl && movie.backdrop_path && (
                <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none select-none">
                  <img src={backdropUrl} alt="" aria-hidden className="absolute inset-0 w-full h-full object-cover object-[center_18%]" />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(10,10,12,0.74) 0%, rgba(10,10,12,0.88) 55%, rgba(10,10,12,0.97) 100%)" }} />
                  <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, rgba(10,10,12,0.55) 0%, rgba(10,10,12,0.15) 60%, rgba(10,10,12,0) 100%)" }} />
                </div>
              )}
              <section className="relative grid grid-cols-[128px_1fr] sm:grid-cols-[212px_1fr] gap-5 sm:gap-8 p-5 sm:p-8">
              <div className="rounded-2xl overflow-hidden ring-1 ring-white/[0.08] shadow-2xl shadow-black/50 aspect-[2/3] bg-foreground/[0.04] h-fit">
                {movie.poster_path && (
                  <img
                    src={getImageUrl(movie.poster_path, "w342")}
                    alt={movie.title}
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div className="space-y-4 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <h1 className="text-[26px] sm:text-[42px] font-extrabold text-foreground tracking-[-0.02em] leading-[1.05]">{movie.title}</h1>
                  <FavoriteButton size="md" item={{
                    id: movie.id, type: "movie", title: movie.title,
                    poster_path: movie.poster_path, vote_average: movie.vote_average,
                    release_date: movie.release_date, addedAt: Date.now(),
                  }} />
                </div>

                {/* Watch status — Хочу / Просмотрел toggle pills */}
                <StatusButtons
                  id={movie.id}
                  type="movie"
                  title={movie.title}
                  poster_path={movie.poster_path}
                  vote_average={movie.vote_average}
                />

                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13.5px] tabular-nums">
                  <span className="inline-flex items-center gap-1.5 font-bold text-amber-300">
                    <Star size={15} className="text-amber-400" fill="currentColor" />
                    {movie.vote_average.toFixed(1)}
                  </span>
                  {movie.release_date && (
                    <><span className="w-1 h-1 rounded-full bg-foreground/25" /><span className="text-foreground/70 font-medium">{new Date(movie.release_date).getFullYear()}</span></>
                  )}
                  {movie.runtime > 0 && (
                    <><span className="w-1 h-1 rounded-full bg-foreground/25" /><span className="text-foreground/70 font-medium">{movie.runtime >= 60 ? `${Math.floor(movie.runtime / 60)} ч ${movie.runtime % 60} мин` : `${movie.runtime} мин`}</span></>
                  )}
                  {movie.genres && movie.genres.length > 0 && (
                    <><span className="w-1 h-1 rounded-full bg-foreground/25" /><span className="text-foreground/55">{movie.genres.slice(0, 3).map(g => g.name).join(", ")}</span></>
                  )}
                  {availInfo?.quality && (
                    <span className="ml-1 px-2.5 py-1 rounded-lg bg-primary/12 text-primary ring-1 ring-primary/25 font-semibold text-[12.5px]">{availInfo.quality}</span>
                  )}
                  {availInfo?.dubs ? (
                    <span className="px-2.5 py-1 rounded-lg bg-foreground/[0.05] text-foreground/70 ring-1 ring-white/[0.06] text-[12.5px]">{availInfo.dubs} {availInfo.dubs === 1 ? "озвучка" : availInfo.dubs < 5 ? "озвучки" : "озвучек"}</span>
                  ) : null}
                </div>

                {movie.overview && (
                  <ExpandableText
                    text={movie.overview}
                    className="text-foreground/65 text-[13px] sm:text-[14px] leading-relaxed"
                  />
                )}

                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2.5 pt-2">
                  <button
                    onClick={() => { openPlayer(false); scrollToPlayer(); }}
                    disabled={isNotReleased}
                    className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 px-6 rounded-xl bg-primary text-primary-foreground text-[14px] font-bold shadow-lg shadow-primary/25 hover:bg-primary/90 hover:-translate-y-px active:translate-y-0 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
                  >
                    {isNotReleased ? (
                      <><CalendarDays size={16} /> {"Скоро в кино"}</>
                    ) : (
                      <><Play size={16} fill="currentColor" /> {"Смотреть"}</>
                    )}
                  </button>
                  {!isNotReleased && resumeTime && resumeTime > 10 && (
                    <button
                      onClick={() => { openPlayer(true); scrollToPlayer(); }}
                      className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 px-5 rounded-xl bg-white/[0.06] ring-1 ring-white/12 text-foreground/90 text-[13.5px] font-semibold hover:bg-white/[0.1] hover:ring-white/20 transition-colors"
                    >
                      <Play size={15} fill="currentColor" /> {"Продолжить с " + formatTime(resumeTime)}
                    </button>
                  )}
                  {/* Скачивание и «Вместе» — Pro-фичи, но обе резолвятся через
                      HDRezka. Пока HDRezka лежит (HDREZKA_UP=false) — прячем. */}
                  {isPro && HDREZKA_UP && (
                    <div className="grid grid-cols-2 gap-2.5 w-full sm:contents">
                      <MovieDownloadButton type="movie" movie={{
                        id: movie.id,
                        title: movie.title,
                        poster_path: movie.poster_path,
                        release_date: movie.release_date,
                        runtime: movie.runtime,
                      }} />
                      <Link
                        href={"/watch/create?q=" + encodeURIComponent(movie.title) + "&id=" + movie.id + "&type=movie&year=" + (movie.release_date ? new Date(movie.release_date).getFullYear() : "") + "&poster=" + (movie.poster_path || "")}
                        className="inline-flex items-center justify-center sm:justify-start gap-2 w-full sm:w-auto h-11 px-4 rounded-xl bg-purple-500/12 ring-1 ring-purple-500/30 text-purple-300 hover:bg-purple-500/20 transition-colors text-[13px] font-semibold"
                        title="Смотреть вместе"
                      >
                        <Users size={15} /> <span className="sm:hidden">{"Вместе"}</span><span className="hidden sm:inline">{"Смотреть вместе"}</span>
                      </Link>
                    </div>
                  )}
                </div>

                {/* Progress bar if any */}
                {resumeTime && resumeTime > 10 && (() => {
                  const sp = getPosition(movie.id, "movie");
                  if (!sp || sp.duration <= 0) return null;
                  const progress = Math.min(100, (sp.time / sp.duration) * 100);
                  const remainingMin = Math.ceil(Math.max(0, sp.duration - sp.time) / 60);
                  return (
                    <div className="pt-3 max-w-2xl">
                      <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: progress + "%" }}
                        />
                      </div>
                      <p className="mt-1.5 text-foreground/50 text-[11px] text-right">{"Осталось " + remainingMin + " мин"}</p>
                    </div>
                  );
                })()}
              </div>
            </section>
            </div>

            {/* Player options (Озвучка / Субтитры / Качество / Скорость) moved INTO
                the ArtPlayer settings menu (gear icon, bottom-right of the player). */}
          </>
        )}
      </div>
    </div>
  );
}
