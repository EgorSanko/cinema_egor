"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Hls from "hls.js";
import { hlsProxyUrl } from "@/lib/quality-probe";
import { pickDefaultQuality, setQualityPref } from "@/lib/quality";
import { resolveAllohaHls, ALLOHA_Q_ORDER, HDREZKA_UP } from "@/lib/kinopub";
import {
  savePosition,
  getPosition,
  addToHistory,
  saveLastTranslator,
  getLastTranslator,
  saveLastEpisode,
  getLastEpisode,
} from "@/lib/storage";
import { getTvUser } from "@/lib/tv-auth";
import { useTvPro } from "@/hooks/use-tv-pro";
import { PreRollAd, type AdClip } from "@/components/pre-roll-ad";
import {
  IconPlay, IconPause, IconRewind10, IconForward10, IconSettings, IconClose,
  IconChevronLeft, IconChevronRight, IconChevronUp, IconChevronDown, IconOk,
  IconCheck, Hint, HintRow,
} from "@/components/tv/tv-icons";

// Пре-ролл для FREE-тарифа на ТВ — та же последовательность, что на сайте
// (movie/tv-player): пропускаемый бампер + непропускаемый ролик. Про — без рекламы.
const AD_SEQUENCE: AdClip[] = [
  { src: "/media/intro2.mp4", skippable: true },
  { src: "/media/oldspice.mp4", skippable: false },
];

// ════════════════════════════════════════════════════════════════
// TV WATCH + PLAYER — fully Android-TV-remote (D-pad) controllable.
//
// Loaded inside the Android TV WebView at /tv-watch/{type}/{id}. No site
// navbar/chrome. Reuses the EXACT resolve machinery the site player uses
// (the /hdrezka/api/search resolve endpoint, hlsProxyUrl wrapping,
// pickDefaultQuality, storage resume) — none of it is reinvented.
//
// Remote keys are handled via BOTH e.key and legacy e.keyCode, because real
// Android TV remotes emit numeric keyCodes (37/38/39/40 arrows, 13 Enter,
// 179/85 play-pause, 8/27 back) and some browsers report key === "" there.
// ════════════════════════════════════════════════════════════════

export type TvWatchSeason = { season_number: number; episode_count: number; name: string };

export type TvWatchMedia = {
  id: number;
  type: "movie" | "tv";
  title: string;        // localized (ru) title — primary search term
  originalTitle: string; // english/original — fallback search term
  year: string;
  poster: string | null;
  posterPath: string | null; // raw TMDB path — for history (not the proxied URL)
  backdrop: string | null;
  overview: string;
  seasons: TvWatchSeason[]; // empty for movies
  // HDRezka-native titles (no TMDB id): resolve the stream DIRECTLY by this
  // HDRezka page URL via /hdrezka/api/resolve instead of the title search chain.
  hdUrl?: string;
};

type Translator = { id: number; name: string; is_premium?: boolean };
type ResolveData = {
  stream?: string;
  streams?: Record<string, string>;
  quality?: string;
  translators?: Translator[];
  active_translator_id?: number;
  results?: unknown[];
  // Alloha-нативный резолв: streams уже проксированы (alloha.m3u8), их НЕ нужно
  // оборачивать повторно через hlsProxyUrl.
  alloha?: boolean;
};

type Episode = { episode_number: number; name: string; still_path: string | null; air_date: string };

// Which screen currently owns the D-pad. The in-player overlay is a SEPARATE
// state machine (`overlay` below) so that the player can be in "none" /
// "controls" / "settings" independently.
type Zone = "picker" | "loading" | "player" | "error";
// In-player overlay state machine.
type Overlay = "none" | "controls" | "settings";
// When overlay === "controls", the D-pad focus is in one of two zones:
// the timeline scrubber ("bar") or the button row ("buttons").
type CtrlZone = "bar" | "buttons";

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "0:00";
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${m}:${String(sec).padStart(2, "0")}`;
};

// Lime focus ring matching /tv-home.
const ringStyle = (focused: boolean, primary?: boolean): React.CSSProperties => ({
  transition: "transform .15s ease-out, box-shadow .15s ease-out, background .15s ease-out",
  transform: focused ? "scale(1.06)" : "scale(1)",
  background: primary
    ? focused ? "var(--primary)" : "rgba(163,230,53,0.75)"
    : focused ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.06)",
  color: primary ? "#0a0a0a" : focused ? "#fff" : "#a1a1aa",
  boxShadow: focused
    ? "0 0 0 4px var(--primary), 0 8px 30px rgba(0,0,0,0.5)"
    : "none",
  outline: "none",
});

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export function TvWatch({ media }: { media: TvWatchMedia }) {
  const router = useRouter();

  // ── Auth gate ── an unauthenticated user can't watch. Read the logged-in
  // user the SAME way auth-context does (localStorage "user" = {email,name}).
  const [authed, setAuthed] = useState(false);

  // ── Тариф + пре-ролл (FREE) ──
  const { isPro, loading: subLoading } = useTvPro();
  const [adDone, setAdDone] = useState(false);
  // Реклама сейчас перекрывает плеер? (в player-зоне, юзер не Про, статус известен,
  // ролики ещё не досмотрены). Реф — чтобы key-handler плеера не дёргался под рекламой.
  const adActive = !isPro && !subLoading && !adDone;
  const adActiveRef = useRef(adActive);
  adActiveRef.current = adActive;
  useEffect(() => {
    if (getTvUser()) setAuthed(true);
    else router.replace("/tv-login");
  }, [router]);

  // ── Resolve / stream state ──
  const [data, setData] = useState<ResolveData | null>(null);
  const [quality, setQuality] = useState<string>("");
  const [translators, setTranslators] = useState<Translator[]>([]);
  const [translatorId, setTranslatorId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Hard failure → full-screen error card (timeout / no playable stream / threw).
  // Distinct from the small inline `error` toast used during dub/quality switches.
  const [resolveFailed, setResolveFailed] = useState(false);
  // Error-card focus: 0 = Повторить, 1 = Назад.
  const [errBtnIdx, setErrBtnIdx] = useState<0 | 1>(0);

  // ── Series picker state ──
  const validSeasons = media.seasons.filter((s) => s.season_number > 0);
  const isSeries = media.type === "tv" && validSeasons.length > 0;
  const [season, setSeason] = useState(1);
  const [episode, setEpisode] = useState(1);
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  // picker focus columns: 0 = озвучка, 1 = сезоны, 2 = серии (HDRezka-style).
  // The dub column only exists once dubs load — until then focus starts on seasons.
  const [pickerCol, setPickerCol] = useState<0 | 1 | 2>(1);
  const [dubIdx, setDubIdx] = useState(0);
  const [seasonIdx, setSeasonIdx] = useState(0);
  const [episodeIdx, setEpisodeIdx] = useState(0);
  // HDRezka scopes seasons/episodes to the selected dub. availTree[season] = the
  // episode numbers that dub has. episodeDubIds = dubs that have the CURRENT
  // (season, episode). hdUrlState = resolved HDRezka page URL (for /api/episodes).
  const [availTree, setAvailTree] = useState<Record<number, number[]> | null>(null);
  const [episodeDubIds, setEpisodeDubIds] = useState<number[] | null>(null);
  const [hdUrlState, setHdUrlState] = useState<string | null>(media.hdUrl ?? null);

  // ── Playback / overlay state ──
  const [zone, setZone] = useState<Zone>(isSeries ? "picker" : "loading");
  // The in-player overlay state machine: none → controls → settings.
  const [overlay, setOverlay] = useState<Overlay>("none");
  const [playing, setPlaying] = useState(true);
  const [pt, setPt] = useState(0);
  const [pd, setPd] = useState(0);
  // Controls row: 0 ⏪ rewind, 1 ⏯ play/pause, 2 ⏩ forward, 3 ⚙ settings, 4 ✕ exit.
  const [ctrlIdx, setCtrlIdx] = useState(1); // default focus on Play/Pause
  // Which zone of the controls overlay has the D-pad: timeline bar or buttons.
  const [ctrlZone, setCtrlZone] = useState<CtrlZone>("bar");
  const [settingsTab, setSettingsTab] = useState<0 | 1 | 2 | 3>(0); // 0 quality 1 dub 2 episodes 3 speed
  const [settingsIdx, setSettingsIdx] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [toast, setToast] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const saveInt = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekOnNext = useRef<number | undefined>(undefined); // preserve pos across source switch
  const treeKeyRef = useRef<string>("");   // last (url,dub) loaded into availTree
  const eptrKeyRef = useRef<string>("");   // last (season,episode) loaded for dub filter
  const pickerInitRef = useRef(false);     // ran the picker dub/tree load once

  // Resolve timeout — a title that never resolves (not on HDRezka / not yet
  // released / hung network) must NOT spin forever. 25s → hard failure.
  const RESOLVE_TIMEOUT_MS = 25000;

  const flash = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }, []);

  // Restore last-watched season/episode + remembered dub on mount.
  useEffect(() => {
    if (isSeries) {
      const last = getLastEpisode(media.id);
      if (last) {
        setSeason(last.season);
        setEpisode(last.episode);
        const sIdx = validSeasons.findIndex((s) => s.season_number === last.season);
        if (sIdx >= 0) setSeasonIdx(sIdx);
      } else if (validSeasons[0]) {
        setSeason(validSeasons[0].season_number);
      }
    }
    const lt = getLastTranslator(media.id, media.type);
    if (lt) setTranslatorId(lt.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ════════════════════════════════════════════════════════════════
  // RESOLVE — reuse the site player's exact endpoint + fallback chain.
  // ════════════════════════════════════════════════════════════════
  const resolve = useCallback(
    async (opts?: { trId?: number | null; s?: number; e?: number; preservePos?: boolean }) => {
      const trId = opts?.trId ?? translatorId ?? getLastTranslator(media.id, media.type)?.id ?? null;
      const s = opts?.s ?? season;
      const e = opts?.e ?? episode;
      // A dub/quality re-resolve (preservePos) keeps the existing inline toast on
      // failure; a fresh resolve raises the full-screen error card instead.
      const isSwitch = !!opts?.preservePos;
      setError("");
      setResolveFailed(false);
      setLoading(true);
      const pos = opts?.preservePos ? videoRef.current?.currentTime || 0 : 0;
      if (pos > 1) seekOnNext.current = pos;

      const year = media.year || "";
      const ruTitle = (media.title || "").replace(/["«»“”]/g, "").trim();
      const origTitle = (media.originalTitle || "").replace(/["«»“”]/g, "").trim();
      const searchTitle = ruTitle || origTitle;
      const trParam = trId ? `&translator_id=${trId}` : "";
      const seriesParam = media.type === "tv" ? `&season=${s}&episode=${e}` : "";

      const build = (title: string, index?: number) =>
        `/hdrezka/api/search?q=${encodeURIComponent(title)}&year=${year}&type=${media.type}` +
        (index != null ? `&index=${index}` : "") +
        seriesParam +
        trParam;

      // The actual resolve work — fetch chain that yields a playable ResolveData
      // or null. Raced against a timeout below so it can never hang forever.
      const doResolve = async (): Promise<ResolveData | null> => {
        // Alloha (нативно) — ОСНОВНОЙ источник для ТВ: HDRezka забанена. Резолвим
        // VK m3u8 (все озвучки/качества, уже проксированы) и мапим в ResolveData.
        // trId = ИНДЕКС озвучки в списке Alloha.
        try {
          const a = await resolveAllohaHls(media.id, media.type, s, e);
          if (a && a.translations.length) {
            // Держим озвучку между сериями ПО ИМЕНИ; индекс — лишь запасной
            // вариант. Alloha может отдавать озвучки в РАЗНОМ порядке для разных
            // серий — тогда матч по одному индексу «сползает» на чужую дорожку
            // (тот самый «сброс озвучки при смене серии»). Индекс сохраняем для
            // дублей-имён (напр. The Office — две дорожки с одинаковым названием).
            let trIdx = typeof trId === "number" && trId >= 0 && trId < a.translations.length ? trId : 0;
            const want = getLastTranslator(media.id, media.type)?.name || null;
            if (want) {
              const norm = (x: string) => (x || "").toLowerCase().replace(/\s+/g, " ").trim();
              const base = (x: string) => norm(x).replace(/\s*\([^)]*\)\s*$/, "").trim();
              const nm = (t: { name: string }) =>
                t.name === want || norm(t.name) === norm(want) || base(t.name) === base(want);
              const matches: number[] = [];
              a.translations.forEach((t, i) => { if (nm(t)) matches.push(i); });
              if (matches.length) trIdx = matches.includes(trIdx) ? trIdx : matches[0];
            }
            // Синхронизируем сохранённое имя с реально выбранным индексом, чтобы
            // следующая серия матчилась от актуальной дорожки.
            saveLastTranslator(media.id, media.type, trIdx, a.translations[trIdx].name);
            const q = a.translations[trIdx].quality || {};
            const sq = ALLOHA_Q_ORDER.find((k) => q[k]) || Object.keys(q)[0];
            return {
              alloha: true,
              stream: q[sq],
              streams: q,
              quality: sq,
              translators: a.translations.map((t, i) => ({ id: i, name: t.name })),
              active_translator_id: trIdx,
            };
          }
        } catch {}
        // Дальше — HDRezka (только если поднимется; сейчас HDREZKA_UP=false).
        if (!HDREZKA_UP) return null;
        // HDRezka-native title → resolve DIRECTLY by URL (the same endpoint the
        // website's HdDetail uses), bypassing the title-search chain below.
        if (media.hdUrl) {
          const rr = await fetch(
            `/hdrezka/api/resolve?url=${encodeURIComponent(media.hdUrl)}${seriesParam}${trParam}`
          );
          const dd: ResolveData = await rr.json();
          return dd?.stream ? dd : null;
        }
        let d: ResolveData | null = null;
        const r = await fetch(build(searchTitle));
        d = await r.json();

        // Primary search returned a disambiguation list — try first few hits.
        if ((!d || !d.stream) && d?.results && d.results.length > 0) {
          for (let i = 0; i < Math.min(d.results.length, 5); i++) {
            const r2 = await fetch(build(searchTitle, i));
            const d2: ResolveData = await r2.json();
            if (d2.stream) { d = d2; break; }
          }
        }

        // Russian title found nothing — retry with the original title.
        if ((!d || !d.stream) && origTitle && origTitle !== ruTitle) {
          const ra = await fetch(build(origTitle));
          const da: ResolveData = await ra.json();
          if (da.stream) d = da;
        }
        return d?.stream ? d : null;
      };

      // Reject after RESOLVE_TIMEOUT_MS so a never-resolving title (not on
      // HDRezka / not yet released / hung network) falls into the catch below.
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("resolve-timeout")), RESOLVE_TIMEOUT_MS);
      });

      try {
        const d = await Promise.race([doResolve(), timeout]);
        if (d?.stream) {
          applyStream(d, trId);
          return true;
        }
        // No playable stream returned.
        if (isSwitch) setError("Контент пока недоступен в этой озвучке");
        else setResolveFailed(true);
        return false;
      } catch {
        // Threw or timed out.
        if (isSwitch) setError("Сервер не отвечает");
        else setResolveFailed(true);
        return false;
      } finally {
        if (timer) clearTimeout(timer);
        setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [translatorId, season, episode, media]
  );

  // Pick the smart default quality (connection-aware + remembered choice) and
  // wrap the chosen tier through the LeadSeek HLS proxy — same as the site.
  const applyStream = (d: ResolveData, requestedTr: number | null) => {
    const sq = pickDefaultQuality(d.streams || {}, d.quality || "");
    // Alloha-URL уже проксирован — не оборачиваем повторно.
    const url = sq && d.streams?.[sq] ? (d.alloha ? d.streams[sq] : hlsProxyUrl(d.streams[sq])) : d.stream;
    setData({ ...d, stream: url, quality: sq || d.quality });
    setQuality(sq || d.quality || "");
    if (d.translators?.length) {
      setTranslators(d.translators);
      // Alloha: active_translator_id уже вычислен матчем по имени — доверяем ему
      // (иначе устаревший prev-индекс держал бы неверную подсветку при смене
      // порядка озвучек между сериями). Прочие источники — прежняя логика.
      setTranslatorId((prev) =>
        d.alloha
          ? (d.active_translator_id ?? requestedTr ?? prev ?? d.translators![0].id)
          : (prev ?? requestedTr ?? d.active_translator_id ?? d.translators![0].id)
      );
    }
  };

  // Auto-resolve a movie immediately on mount (few clicks → straight to player).
  useEffect(() => {
    if (!isSeries) {
      setZone("loading");
      resolve().then((ok) => { setZone(ok ? "player" : "error"); });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Load episode list whenever a season is focused/selected (series). ──
  useEffect(() => {
    if (!isSeries) return;
    // HDRezka-native series have no TMDB metadata — synthesize a numbered episode
    // list from the season's episode_count (the player still resolves each one).
    if (media.hdUrl) {
      const sea = validSeasons.find((s) => s.season_number === season);
      const count = sea?.episode_count || 0;
      setEpisodes(
        Array.from({ length: count }, (_, i) => ({
          episode_number: i + 1,
          name: `Серия ${i + 1}`,
          still_path: null,
          air_date: "",
        }))
      );
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/tv-episodes?id=${media.id}&season=${season}`);
        const eps: Episode[] = await res.json();
        if (alive) setEpisodes(Array.isArray(eps) ? eps : []);
      } catch {
        if (alive) setEpisodes([]);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, isSeries]);

  // ── HDRezka-style per-dub gating ─────────────────────────────────
  // Load the season/episode tree for a dub. With no dub given, first discover the
  // default dub (the no-translator response is the page union of ALL seasons, not
  // what the default dub really has), then fetch that dub's real tree.
  const loadTree = useCallback(async (url: string, trId?: number | null): Promise<Record<number, number[]> | null> => {
    try {
      let tid = trId ?? null;
      if (tid == null) {
        const r0 = await fetch(`/hdrezka/api/episodes?url=${encodeURIComponent(url)}`);
        const d0 = await r0.json();
        if (d0?.translators?.length) {
          setTranslators(d0.translators);
          tid = d0.active_translator_id ?? d0.translators[0].id;
          setTranslatorId((prev) => prev ?? tid);
        }
      }
      const p = new URLSearchParams({ url });
      if (tid) p.set("translator_id", String(tid));
      const r = await fetch(`/hdrezka/api/episodes?${p.toString()}`);
      const d = await r.json();
      if (d?.translators?.length) {
        setTranslators((prev) => (prev.length ? prev : d.translators));
        setTranslatorId((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
      }
      if (d?.seasons) {
        const tree: Record<number, number[]> = {};
        for (const [s, eps] of Object.entries(d.seasons)) tree[parseInt(s, 10)] = (eps as number[]) || [];
        setAvailTree(tree);
        return tree;
      }
    } catch { /* keep default seasons on failure */ }
    return null;
  }, []);

  // Discover the HDRezka page URL for a TMDB title (hd-native already has it),
  // surfacing its dub list along the way. Returns the url or null.
  const fetchMeta = useCallback(async (): Promise<string | null> => {
    if (media.hdUrl) return media.hdUrl;
    // HDRezka забанена (HDREZKA_UP=false) и на любой запрос отдаёт пустоту —
    // в логах с телевизора видно по два бесполезных запроса на каждый тайтл.
    // Поток резолвится через Alloha и без этого, поэтому просто не ходим.
    if (!HDREZKA_UP) return null;
    const year = media.year || "";
    const ru = (media.title || "").replace(/["«»“”]/g, "").trim();
    const orig = (media.originalTitle || "").replace(/["«»“”]/g, "").trim();
    const names = [ru, orig].filter((n, i, a) => n && a.indexOf(n) === i);
    const grab = (d: any): string | null => {
      if (!d?.url) return null;
      if (d.translators?.length) {
        setTranslators(d.translators);
        setTranslatorId((prev) => prev ?? d.active_translator_id ?? d.translators[0].id);
      }
      return d.url as string;
    };
    for (const name of names) {
      try {
        const r = await fetch(`/hdrezka/api/search?q=${encodeURIComponent(name)}&year=${year}&type=${media.type}&season=${season}&episode=${episode}`);
        const u = grab(await r.json());
        if (u) return u;
        const rr = await fetch(`/hdrezka/api/search?q=${encodeURIComponent(name)}&year=${year}&type=${media.type}&season=${season}&episode=${episode}`);
        const dd = await rr.json();
        if (dd?.results?.length) {
          for (let i = 0; i < Math.min(dd.results.length, 3); i++) {
            const r2 = await fetch(`/hdrezka/api/search?q=${encodeURIComponent(name)}&year=${year}&type=${media.type}&index=${i}&season=${season}&episode=${episode}`);
            const u2 = grab(await r2.json());
            if (u2) return u2;
          }
        }
      } catch { /* try next name */ }
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [media, season, episode]);

  // On entering the series picker: discover URL + dubs, load the default dub's
  // tree so seasons/episodes scope to it. Runs once.
  useEffect(() => {
    if (!isSeries || pickerInitRef.current) return;
    pickerInitRef.current = true;
    let alive = true;
    (async () => {
      const url = media.hdUrl || (await fetchMeta());
      if (!alive || !url) return;
      setHdUrlState(url);
      const lastTr = getLastTranslator(media.id, media.type)?.id ?? null;
      const tree = await loadTree(url, lastTr);
      if (alive && tree) {
        const ss = Object.keys(tree).map(Number).sort((a, b) => a - b);
        if (ss.length && !tree[season]) { setSeason(ss[0]); setSeasonIdx(0); }
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSeries]);

  // Which dubs have the current (season, episode) — for the in-player dub filter.
  useEffect(() => {
    if (!isSeries || !hdUrlState) return;
    const key = season + "|" + episode;
    if (eptrKeyRef.current === key) return;
    eptrKeyRef.current = key;
    let alive = true;
    (async () => {
      try {
        const r = await fetch(`/hdrezka/api/episode-translators?url=${encodeURIComponent(hdUrlState)}&season=${season}&episode=${episode}`);
        const d = await r.json();
        if (alive) setEpisodeDubIds(Array.isArray(d?.ids) ? d.ids : null);
      } catch { if (alive) setEpisodeDubIds(null); }
    })();
    return () => { alive = false; };
  }, [hdUrlState, isSeries, season, episode]);

  // Dub-scoped lists used by the picker + settings.
  const gatedSeasons = availTree
    ? validSeasons.filter((s) => (availTree[s.season_number]?.length ?? 0) > 0)
    : validSeasons;
  const _treeEps = availTree?.[season];
  const _allEps: Episode[] = (_treeEps && _treeEps.length)
    ? _treeEps.map((n) => episodes.find((e) => e.episode_number === n) || { episode_number: n, name: `Серия ${n}`, still_path: null, air_date: "" })
    : episodes;
  // Показываем только ВЫШЕДШИЕ серии. У «Холода» TMDB отдаёт десять, а вышло
  // шесть: остальные с датой в будущем и без кадра. В списке они выглядели
  // как обычные, человек на них заходил и упирался в пустоту.
  // Серию без даты не прячем — это чаще пробел в данных, чем будущий эфир.
  const pickerEpisodes: Episode[] = (() => {
    const today = new Date().toISOString().slice(0, 10);
    const aired = _allEps.filter((e) => !e.air_date || e.air_date <= today);
    return aired.length ? aired : _allEps;
  })();
  const playerDubs = (() => {
    if (!episodeDubIds || episodeDubIds.length === 0) return translators;
    const allow = new Set(episodeDubIds);
    if (translatorId != null) allow.add(translatorId);
    const f = translators.filter((t) => allow.has(t.id));
    return f.length ? f : translators;
  })();
  const hasDubCol = translators.length > 0;

  // ════════════════════════════════════════════════════════════════
  // HLS load — direct hls.js wrapper (no site chrome). Resumes to seekOnNext
  // (source switch) or saved position.
  // ════════════════════════════════════════════════════════════════
  useEffect(() => {
    const url = data?.stream;
    const v = videoRef.current;
    if (!url || !v) return;
    // FREE: контент не грузится/не играет, пока не досмотрена реклама (пре-ролл
    // сверху). Как только adDone (или юзер Про) — эффект перезапустится и стартует.
    if (!isPro && !adDone) return;

    const seekTarget = (() => {
      if (seekOnNext.current && seekOnNext.current > 1) return seekOnNext.current;
      const sp = getPosition(media.id, media.type, isSeries ? season : undefined, isSeries ? episode : undefined);
      return sp && sp.time > 10 ? sp.time : 0;
    })();
    seekOnNext.current = undefined;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }

    const attachSeek = () => { if (seekTarget > 0) { try { v.currentTime = seekTarget; } catch {} } };

    if (url.includes(".m3u8") && Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
      hlsRef.current = hls;
      hls.loadSource(url);
      hls.attachMedia(v);
      hls.on(Hls.Events.MANIFEST_PARSED, () => { attachSeek(); v.play().catch(() => {}); });
      hls.on(Hls.Events.ERROR, (_e, d) => {
        if (!d.fatal) return;
        if (d.type === Hls.ErrorTypes.NETWORK_ERROR) hls.startLoad();
        else if (d.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else setError("Ошибка воспроизведения");
      });
    } else {
      v.src = url;
      v.onloadedmetadata = () => { attachSeek(); v.play().catch(() => {}); };
    }

    return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.stream, isPro, adDone]);

  // Video element events → progress/paused state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => { setPt(v.currentTime); setPd(v.duration || 0); };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [data?.stream]);

  // Periodic position save (drives resume + the site's continue-watching sync).
  useEffect(() => {
    if (!data?.stream) return;
    saveInt.current = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.paused || !v.duration) return;
      savePosition(media.id, media.type, v.currentTime, v.duration, isSeries ? season : undefined, isSeries ? episode : undefined);
      addToHistory({
        id: media.id,
        type: media.type,
        title: media.title,
        poster_path: media.posterPath,
        vote_average: 0,
        watchedAt: Date.now(),
        progress: v.currentTime,
        duration: v.duration,
        quality,
        season: isSeries ? season : undefined,
        episode: isSeries ? episode : undefined,
      });
    }, 5000);
    return () => { if (saveInt.current) clearInterval(saveInt.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.stream, season, episode, quality]);

  const saveNow = useCallback(() => {
    const v = videoRef.current;
    if (v && v.duration) {
      savePosition(media.id, media.type, v.currentTime, v.duration, isSeries ? season : undefined, isSeries ? episode : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, episode, isSeries, media]);

  // ── Controls auto-hide ──
  // Show the controls bar and (re)arm the ~5s auto-hide timer. Never auto-hides
  // while the settings panel is open.
  const revealControls = useCallback((zone: CtrlZone = "bar") => {
    setOverlay("controls");
    setCtrlZone(zone);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay((o) => (o === "controls" ? "none" : o));
    }, 5000);
  }, []);

  // Reset the auto-hide timer on every handled key press (no-op while settings
  // is open — settings must stay until Back).
  const bumpHideTimer = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay((o) => (o === "controls" ? "none" : o));
    }, 5000);
  }, []);

  // Briefly flash the controls bar on a blind seek, then let it auto-hide.
  const flashControls = useCallback(() => {
    setOverlay("controls");
    setCtrlZone("bar");
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setOverlay((o) => (o === "controls" ? "none" : o));
    }, 1800);
  }, []);

  // Clear any pending auto-hide (used when entering settings).
  const clearHideTimer = useCallback(() => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
  }, []);

  // ════════════════════════════════════════════════════════════════
  // ACTIONS
  // ════════════════════════════════════════════════════════════════
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play().catch(() => {}); } else { v.pause(); }
  }, []);

  const seek = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min((v.duration || 1e9), v.currentTime + delta));
    flash(delta > 0 ? "+10 секунд" : "−10 секунд");
  }, [flash]);

  // Scrubber seek — ±delta along the timeline, updating progress state live so
  // the filled bar + current-time label track the playhead immediately.
  const scrub = useCallback((delta: number) => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const next = Math.max(0, Math.min(v.duration, v.currentTime + delta));
    v.currentTime = next;
    setPt(next);
  }, []);

  // ── Error card: retry the resolve, or go back. ──
  const retryResolve = useCallback(() => {
    setZone("loading");
    setErrBtnIdx(0);
    resolve().then((ok) => { setZone(ok ? "player" : "error"); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolve]);

  // «Назад» from the error card: movie → /tv-home, series → episode picker.
  const errorBack = useCallback(() => {
    if (isSeries) {
      setResolveFailed(false);
      setData(null);
      setZone("picker");
    } else {
      router.push("/tv-home");
    }
  }, [isSeries, router]);

  // Quality switch — preserve position via seekOnNext, switch proxied source.
  const changeQuality = useCallback((q: string) => {
    if (!data?.streams?.[q] || q === quality) return;
    setQualityPref(q);
    seekOnNext.current = videoRef.current?.currentTime || 0;
    setQuality(q);
    setData((prev) => (prev ? { ...prev, stream: data.alloha ? data.streams![q] : hlsProxyUrl(data.streams![q]), quality: q } : prev));
    flash(`Качество: ${q}`);
  }, [data, quality, flash]);

  // Playback speed — applied to the <video> element (reapplied after each source
  // switch via the effect below, since a new manifest resets playbackRate to 1).
  const changeSpeed = useCallback((v: number) => {
    setSpeed(v);
    if (videoRef.current) videoRef.current.playbackRate = v;
    flash(`Скорость: ${v}×`);
  }, [flash]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, data?.stream]);

  // Dub switch — re-resolve with translator_id, preserve position.
  const changeTranslator = useCallback(async (tid: number) => {
    if (tid === translatorId) return;
    const name = translators.find((t) => t.id === tid)?.name || "";
    setTranslatorId(tid);
    saveLastTranslator(media.id, media.type, tid, name);
    flash(`Озвучка: ${name}`);
    if (hdUrlState) loadTree(hdUrlState, tid); // re-scope seasons/episodes to the new dub
    await resolve({ trId: tid, preservePos: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translatorId, translators, media, resolve, flash, hdUrlState, loadTree]);

  // Pick a dub IN THE PICKER (no playback yet): remember it, re-scope the season/
  // episode lists to it, and move focus to the season column.
  const pickDub = useCallback(async (tid: number) => {
    const name = translators.find((t) => t.id === tid)?.name || "";
    setTranslatorId(tid);
    setDubIdx(translators.findIndex((t) => t.id === tid));
    saveLastTranslator(media.id, media.type, tid, name);
    if (hdUrlState) {
      const tree = await loadTree(hdUrlState, tid);
      if (tree) {
        const ss = Object.keys(tree).map(Number).filter((n) => (tree[n] || []).length).sort((a, b) => a - b);
        const s0 = ss[0] ?? season;
        setSeason(s0);
      }
    }
    setSeasonIdx(0);
    setEpisodeIdx(0);
    setPickerCol(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [translators, media, hdUrlState, loadTree, season]);

  // Play a series episode: remember it, resolve, enter the player.
  const playEpisode = useCallback(async (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    saveLastEpisode(media.id, s, e);
    setOverlay("none");
    setZone("loading");
    const ok = await resolve({ s, e });
    setZone(ok ? "player" : "error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolve, media]);

  // Exit: back to /tv-home (or, for a series in the player, back to the picker).
  const exit = useCallback(() => {
    saveNow();
    if (videoRef.current) videoRef.current.pause();
    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    setOverlay("none");
    if (isSeries) {
      setData(null);
      setZone("picker");
    } else {
      router.push("/tv-home");
    }
  }, [isSeries, router, saveNow]);

  // ════════════════════════════════════════════════════════════════
  // REMOTE / KEYBOARD — e.key AND legacy e.keyCode.
  // ════════════════════════════════════════════════════════════════
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const k = e.key;
      const c = e.keyCode;
      if (["F5", "F11", "F12"].includes(k)) return;

      const isLeft = k === "ArrowLeft" || c === 37;
      const isUp = k === "ArrowUp" || c === 38;
      const isRight = k === "ArrowRight" || c === 39;
      const isDown = k === "ArrowDown" || c === 40;
      const isEnter = k === "Enter" || c === 13;
      const isSpace = k === " " || k === "Spacebar" || c === 32;
      const isPlayPause = c === 179 || c === 85 || k === "MediaPlayPause";
      const isBack = k === "Escape" || k === "Backspace" || k === "GoBack" || k === "BrowserBack" || c === 27 || c === 8 || c === 461 || c === 10009;

      if (!isLeft && !isUp && !isRight && !isDown && !isEnter && !isSpace && !isPlayPause && !isBack) return;
      e.preventDefault();

      // Под рекламой (FREE) плеером не управляем: стрелки/OK глотает сам пре-ролл
      // (capture-listener), здесь гасим остальное; «Назад» — выход.
      if (adActiveRef.current) { if (isBack) exit(); return; }

      // ────────── SERIES PICKER (Озвучка | Сезоны | Серии) ──────────
      if (zone === "picker") {
        if (isBack) { router.push("/tv-home"); return; }
        // ── Озвучка column (0) ──
        if (pickerCol === 0) {
          if (isUp) setDubIdx((i) => Math.max(0, i - 1));
          else if (isDown) setDubIdx((i) => Math.min(translators.length - 1, i + 1));
          else if (isRight) setPickerCol(1);
          else if (isEnter || isSpace) {
            const t = translators[dubIdx];
            if (t) pickDub(t.id);
          }
        // ── Сезоны column (1) ──
        } else if (pickerCol === 1) {
          if (isUp) setSeasonIdx((i) => Math.max(0, i - 1));
          else if (isDown) setSeasonIdx((i) => Math.min(gatedSeasons.length - 1, i + 1));
          else if (isLeft) { if (hasDubCol) setPickerCol(0); }
          else if (isRight) { setPickerCol(2); setEpisodeIdx(0); }
          else if (isEnter || isSpace) {
            const sn = gatedSeasons[seasonIdx]?.season_number;
            if (sn != null) { setSeason(sn); setPickerCol(2); setEpisodeIdx(0); }
          }
        // ── Серии column (2) ──
        } else {
          // Серии нарисованы В ОДНУ колонку, поэтому «вниз» — это следующая
          // серия. В две колонки «вниз» уходило через строку: с пятой серии
          // попадало на седьмую, а шестая оставалась сбоку и выглядела как
          // пропущенная. Плюс с превью список читается как на сайте.
          const EP_COLS = 1;
          const last = Math.max(0, pickerEpisodes.length - 1);
          if (isLeft) {
            // Из левой колонки уходим к сезонам, из правой — на соседнюю слева.
            if (episodeIdx % EP_COLS === 0) setPickerCol(1);
            else setEpisodeIdx((i) => Math.max(0, i - 1));
          } else if (isRight) {
            setEpisodeIdx((i) => Math.min(last, i + 1));
          } else if (isUp) {
            setEpisodeIdx((i) => (i - EP_COLS >= 0 ? i - EP_COLS : i));
          } else if (isDown) {
            setEpisodeIdx((i) => (i + EP_COLS <= last ? i + EP_COLS : Math.min(last, i)));
          } else if (isEnter || isSpace || isPlayPause) {
            const ep = pickerEpisodes[episodeIdx];
            if (ep) playEpisode(season, ep.episode_number);
          }
        }
        return;
      }

      // ────────── LOADING ──────────
      if (zone === "loading") {
        if (isBack) exit();
        return;
      }

      // ────────── ERROR CARD ──────────
      // Two buttons: 0 Повторить, 1 Назад. ◀▶ move, OK activates, Back = Назад.
      if (zone === "error") {
        if (isBack) { errorBack(); return; }
        if (isLeft) { setErrBtnIdx(0); return; }
        if (isRight) { setErrBtnIdx(1); return; }
        if (isEnter || isSpace || isPlayPause) {
          if (errBtnIdx === 0) retryResolve();
          else errorBack();
          return;
        }
        return;
      }

      // From here on we are in the PLAYER (zone === "player"). The overlay
      // state machine (none / controls / settings) owns the D-pad.

      // ════════ overlay === "settings" ════════
      // Panel with tabs Качество / Озвучка / Серии and a scrollable list.
      if (overlay === "settings") {
        const tabs: Array<0 | 1 | 2 | 3> = isSeries ? [0, 1, 2, 3] : [0, 1, 3];
        const list =
          settingsTab === 0 ? (data?.streams ? Object.keys(data.streams) : [])
          : settingsTab === 1 ? playerDubs.map((t) => t.name)
          : settingsTab === 3 ? SPEEDS.map((s) => `${s}×`)
          : pickerEpisodes.map((ep) => `${ep.episode_number}`);

        // Back → close settings → controls (NOT exit the player).
        if (isBack) { setOverlay("controls"); revealControls(); return; }
        // ◀▶ switch the active tab.
        if (isLeft) {
          const ti = tabs.indexOf(settingsTab);
          if (ti > 0) { setSettingsTab(tabs[ti - 1]); setSettingsIdx(0); }
        } else if (isRight) {
          const ti = tabs.indexOf(settingsTab);
          if (ti < tabs.length - 1) { setSettingsTab(tabs[ti + 1]); setSettingsIdx(0); }
        // ▲▼ move focus within the active list.
        } else if (isUp) {
          setSettingsIdx((i) => Math.max(0, i - 1));
        } else if (isDown) {
          setSettingsIdx((i) => Math.min(Math.max(0, list.length - 1), i + 1));
        // OK → select the focused item; KEEP settings open afterwards.
        } else if (isEnter || isSpace || isPlayPause) {
          const qualities = data?.streams ? Object.keys(data.streams) : [];
          if (settingsTab === 0 && qualities[settingsIdx]) changeQuality(qualities[settingsIdx]);
          else if (settingsTab === 1 && playerDubs[settingsIdx]) changeTranslator(playerDubs[settingsIdx].id);
          else if (settingsTab === 2 && pickerEpisodes[settingsIdx]) playEpisode(season, pickerEpisodes[settingsIdx].episode_number);
          else if (settingsTab === 3 && SPEEDS[settingsIdx] !== undefined) changeSpeed(SPEEDS[settingsIdx]);
        }
        return;
      }

      // ════════ overlay === "controls" ════════
      // Two focus zones: "bar" (the timeline scrubber) and "buttons" (the
      // ⏪ ⏯ ⏩ ⚙ ✕ row).
      const CTRL_COUNT = 5;
      if (overlay === "controls") {
        // ───── zone "bar": the scrubbable timeline ─────
        if (ctrlZone === "bar") {
          // Back → hide controls.
          if (isBack) { clearHideTimer(); setOverlay("none"); return; }
          // ◀▶ → seek ±10s live along the timeline.
          if (isLeft) { scrub(-10); bumpHideTimer(); return; }
          if (isRight) { scrub(10); bumpHideTimer(); return; }
          // ▼ → drop to the button row.
          if (isDown) { setCtrlZone("buttons"); bumpHideTimer(); return; }
          // ▲ → stay on the bar.
          if (isUp) { bumpHideTimer(); return; }
          // OK → toggle play/pause.
          if (isEnter || isSpace || isPlayPause) { togglePlay(); bumpHideTimer(); return; }
          return;
        }
        // ───── zone "buttons": the existing control row ─────
        // ▲ → return to the timeline bar.
        if (isUp) { setCtrlZone("bar"); bumpHideTimer(); return; }
        // Back OR ▼ → hide controls.
        if (isBack || isDown) { clearHideTimer(); setOverlay("none"); return; }
        // ◀▶ → move focus between buttons.
        if (isLeft) { setCtrlIdx((i) => Math.max(0, i - 1)); bumpHideTimer(); return; }
        if (isRight) { setCtrlIdx((i) => Math.min(CTRL_COUNT - 1, i + 1)); bumpHideTimer(); return; }
        // OK → ACTIVATE the focused button. Settings open ONLY here, on ⚙.
        if (isEnter || isSpace || isPlayPause) {
          if (ctrlIdx === 0) { seek(-10); bumpHideTimer(); }
          else if (ctrlIdx === 1) { togglePlay(); bumpHideTimer(); }
          else if (ctrlIdx === 2) { seek(10); bumpHideTimer(); }
          else if (ctrlIdx === 3) { clearHideTimer(); setSettingsTab(0); setSettingsIdx(0); setOverlay("settings"); }
          else if (ctrlIdx === 4) { exit(); }
          return;
        }
        return;
      }

      // ════════ overlay === "none" (just playing) ════════
      // Back → exit the player (router back / picker for a series).
      if (isBack) { exit(); return; }
      // ▲ or ▼ → reveal the controls overlay, focus the TIMELINE bar by default.
      // MUST NOT open settings.
      if (isUp || isDown) { setCtrlIdx(1); revealControls("bar"); return; }
      // OK / Space / MediaPlayPause → toggle play/pause.
      if (isEnter || isSpace || isPlayPause) { togglePlay(); return; }
      // ◀▶ → blind seek −10s / +10s and briefly flash the controls bar.
      if (isLeft) { seek(-10); flashControls(); return; }
      if (isRight) { seek(10); flashControls(); return; }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    zone, overlay, pickerCol, dubIdx, seasonIdx, episodeIdx, validSeasons, gatedSeasons,
    episodes, pickerEpisodes, playerDubs, hasDubCol, season, episode,
    isSeries, data, translators, translatorId, settingsTab, settingsIdx, ctrlIdx, ctrlZone,
    errBtnIdx, router, exit, resolve, playEpisode, pickDub, changeQuality, changeTranslator, changeSpeed, seek, scrub,
    togglePlay, revealControls, bumpHideTimer, flashControls, clearHideTimer,
    retryResolve, errorBack,
  ]);

  const qualities = data?.streams ? Object.keys(data.streams) : [];

  // ════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════
  // Hold the player blank until the auth gate resolves (redirecting otherwise).
  if (!authed) {
    return <div className="fixed inset-0" style={{ background: "#000" }} />;
  }

  return (
    <div className="fixed inset-0 bg-black text-foreground select-none overflow-hidden" style={{ background: "#000" }}>
      {/* ───────── SERIES PICKER ───────── */}
      {zone === "picker" && isSeries && (
        <div className="absolute inset-0 flex flex-col" style={{ background: "var(--background)" }}>
          <header className="px-12 pt-9 pb-5">
            <h1 className="text-4xl font-extrabold tracking-tight">{media.title}</h1>
            <p className="mt-2 text-lg text-muted-foreground">{media.year} · Сериал · Выберите серию</p>
          </header>
          <div className="flex flex-1 gap-6 px-12 pb-10 overflow-hidden">
            {/* Озвучка — pick a dub; seasons/episodes below scope to it (HDRezka). */}
            {hasDubCol && (
              <div className="w-[220px] shrink-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
                <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Озвучка</p>
                <div className="flex flex-col gap-2">
                  {translators.map((t, i) => {
                    const f = pickerCol === 0 && dubIdx === i;
                    const active = t.id === translatorId;
                    return (
                      <button
                        key={t.id}
                        onClick={() => pickDub(t.id)}
                        ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                        className="flex items-center justify-between gap-2 rounded-xl px-4 py-3 text-left text-base font-semibold"
                        style={{
                          ...ringStyle(f),
                          background: f ? "var(--primary)" : active ? "rgba(163,230,53,0.18)" : "rgba(255,255,255,0.05)",
                          color: f ? "#0a0a0a" : active ? "var(--primary)" : "#d4d4d8",
                        }}
                      >
                        <span className="truncate">{t.name}</span>
                        {t.is_premium && <span className="shrink-0 text-[11px] font-bold px-1 rounded bg-amber-400/25 text-amber-300">PRO</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {/* Сезоны (scoped to the dub) */}
            <div className="w-[240px] shrink-0 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Сезоны</p>
              <div className="flex flex-col gap-2">
                {gatedSeasons.map((s, i) => {
                  const f = pickerCol === 1 && seasonIdx === i;
                  const active = s.season_number === season;
                  return (
                    <button
                      key={s.season_number}
                      onClick={() => { setSeason(s.season_number); setSeasonIdx(i); setPickerCol(2); setEpisodeIdx(0); }}
                      ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                      className="rounded-xl px-5 py-4 text-left text-lg font-semibold"
                      style={{
                        ...ringStyle(f),
                        background: f ? "var(--primary)" : active ? "rgba(163,230,53,0.18)" : "rgba(255,255,255,0.05)",
                        color: f ? "#0a0a0a" : active ? "var(--primary)" : "#d4d4d8",
                      }}
                    >
                      {s.name || `Сезон ${s.season_number}`}
                      <span className="ml-2 text-sm opacity-70">{(availTree?.[s.season_number]?.length ?? s.episode_count)} сер.</span>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Серии (scoped to the dub) */}
            <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
              <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Серии · Сезон {season}</p>
              {pickerEpisodes.length === 0 ? (
                <p className="text-muted-foreground">Загрузка серий…</p>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {pickerEpisodes.map((ep, i) => {
                    const f = pickerCol === 2 && episodeIdx === i;
                    const дата = ep.air_date
                      ? ep.air_date.slice(8, 10) + "." + ep.air_date.slice(5, 7) + "." + ep.air_date.slice(0, 4)
                      : "";
                    return (
                      <button
                        key={ep.episode_number}
                        onClick={() => playEpisode(season, ep.episode_number)}
                        ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                        className="flex items-center gap-4 rounded-xl p-3 text-left"
                        style={ringStyle(f)}
                      >
                        {/* Кадр из серии — как на сайте. Соотношение 16:9 держим
                            жёстко, чтобы строки не прыгали по высоте, когда у
                            части серий кадра нет. */}
                        <span
                          className="relative flex shrink-0 items-center justify-center overflow-hidden rounded-lg"
                          style={{ width: "10.5rem", height: "5.9rem", background: "rgba(255,255,255,.07)" }}
                        >
                          {ep.still_path ? (
                            <img
                              src={`/tmdb-img/w300${ep.still_path}`}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <span className="text-2xl font-bold tabular-nums opacity-40">{ep.episode_number}</span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>
                            Серия {ep.episode_number}
                          </span>
                          <span className="block truncate text-lg font-medium">
                            {ep.name || `Серия ${ep.episode_number}`}
                          </span>
                          {дата ? (
                            <span className="block text-sm" style={{ opacity: f ? 0.6 : 0.45 }}>{дата}</span>
                          ) : null}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <HintRow className="px-12 pb-5 justify-start">
            <Hint icon={<><IconChevronLeft size={16} /><IconChevronRight size={16} /></>}>колонка</Hint>
            <Hint icon={<><IconChevronUp size={16} /><IconChevronDown size={16} /></>}>выбор</Hint>
            <Hint icon={<IconOk size={16} />}>выбрать / смотреть</Hint>
          </HintRow>
        </div>
      )}

      {/* ───────── LOADING ───────── */}
      {zone === "loading" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5" style={{ background: "var(--background)" }}>
          <div className="h-16 w-16 rounded-full border-4 border-white/15" style={{ borderTopColor: "var(--primary)", animation: "tvspin 0.8s linear infinite" }} />
          <p className="text-xl font-semibold">Загрузка…</p>
          <p className="text-base text-muted-foreground">{media.title}{isSeries ? ` · S${season}E${episode}` : ""}</p>
        </div>
      )}

      {/* ───────── ERROR CARD ───────── */}
      {/* Shown when a fresh resolve fails (timeout / no playable stream / threw).
          Centered, dark, lime accent. ◀▶ between the two buttons, OK activates,
          Back = Назад. */}
      {zone === "error" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-6 px-12 text-center" style={{ background: "var(--background)" }}>
          <div className="flex h-16 w-16 items-center justify-center rounded-full" style={{ background: "rgba(163,230,53,0.18)" }}>
            <span className="text-3xl" style={{ color: "var(--primary)" }}>!</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-3xl font-extrabold tracking-tight text-white">
              {media.title}{isSeries ? ` · S${season}E${episode}` : ""}
            </h2>
            <p className="text-xl font-semibold" style={{ color: "var(--primary)" }}>Не удалось загрузить</p>
            <p className="max-w-[640px] text-base text-muted-foreground">
              Возможно, фильм ещё не вышел или временно недоступен.
            </p>
          </div>
          <div className="mt-2 flex items-center gap-4">
            {[
              { label: "Повторить", primary: true },
              { label: "Назад", primary: false },
            ].map((b, i) => {
              const f = errBtnIdx === i;
              return (
                <button
                  key={b.label}
                  onClick={() => (i === 0 ? retryResolve() : errorBack())}
                  className="rounded-xl px-8 py-4 text-lg font-bold"
                  style={ringStyle(f, b.primary && f ? true : b.primary)}
                >
                  {b.label}
                </button>
              );
            })}
          </div>
          <HintRow className="mt-3">
            <Hint icon={<><IconChevronLeft size={16} /><IconChevronRight size={16} /></>}>выбор</Hint>
            <Hint icon={<IconOk size={16} />}>ОК</Hint>
          </HintRow>
        </div>
      )}

      {/* ───────── PLAYER ───────── */}
      {zone === "player" && (
        <>
          <video ref={videoRef} className="absolute inset-0 h-full w-full bg-black" playsInline autoPlay />

          {/* FREE-тариф: пре-ролл поверх плеера (пультом: OK — пропустить когда
              можно). Контент под ним не грузится, пока adDone=false (гейт в hls). */}
          {adActive && <PreRollAd ads={AD_SEQUENCE} onDone={() => setAdDone(true)} tvMode />}

          {/* Title chip — shown whenever an overlay is up. */}
          {overlay !== "none" && (
            <div className="pointer-events-none absolute z-10 text-lg font-semibold text-white/70" style={{ left: "4vw", top: "4vh" }}>
              {media.title}{isSeries ? ` · S${season}E${episode}` : ""}
            </div>
          )}

          {/* Inline loading (dub/quality re-resolve) */}
          {loading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/55 backdrop-blur-sm">
              <div className="h-14 w-14 rounded-full border-4 border-white/15" style={{ borderTopColor: "var(--primary)", animation: "tvspin 0.8s linear infinite" }} />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-black/80">
              <p className="text-lg text-red-400">{error}</p>
              <button
                onClick={() => resolve().then((ok) => ok && setZone("player"))}
                className="rounded-xl px-6 py-3 font-semibold"
                style={ringStyle(true, true)}
              >
                Попробовать снова
              </button>
            </div>
          )}

          {/* ── CONTROLS BAR ── overscan-safe (pad ~4vh/4vw, not flush). */}
          {overlay === "controls" && (
            <div
              className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/95 via-black/70 to-transparent pt-16"
              style={{ paddingLeft: "4vw", paddingRight: "4vw", paddingBottom: "4vh" }}
            >
              {/* Scrubbable timeline — focus zone "bar". When focused: lime track,
                  thicker bar, a knob at the playhead. ◀▶ seek ±10s live. */}
              {(() => {
                const barFocused = ctrlZone === "bar";
                const pct = pd > 0 ? Math.min(100, (pt / pd) * 100) : 0;
                return (
                  <div className="mb-5 flex items-center gap-4">
                    <span
                      className="w-[68px] text-right tabular-nums text-sm"
                      style={{ color: barFocused ? "var(--primary)" : undefined }}
                    >
                      {fmt(pt)}
                    </span>
                    <div
                      className="relative flex-1 rounded-full"
                      style={{
                        height: barFocused ? 8 : 6,
                        background: "rgba(255,255,255,0.15)",
                        transition: "height .15s ease-out, box-shadow .15s ease-out",
                        boxShadow: barFocused ? "0 0 0 3px var(--primary)" : "none",
                      }}
                    >
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{ width: `${pct}%`, background: "var(--primary)" }}
                      />
                      {/* Playhead knob */}
                      <div
                        className="absolute top-1/2 rounded-full"
                        style={{
                          left: `${pct}%`,
                          width: barFocused ? 18 : 12,
                          height: barFocused ? 18 : 12,
                          transform: "translate(-50%, -50%)",
                          background: "var(--primary)",
                          boxShadow: barFocused ? "0 0 0 4px rgba(0,0,0,0.45)" : "0 0 0 2px rgba(0,0,0,0.4)",
                          transition: "width .15s ease-out, height .15s ease-out",
                        }}
                      />
                    </div>
                    <span className="w-[68px] tabular-nums text-sm text-muted-foreground/70">{fmt(pd)}</span>
                  </div>
                );
              })()}
              <div className="flex items-center justify-center gap-3">
                {/* Order MUST match the key handler: 0 rewind 1 play/pause 2 forward 3 settings 4 exit */}
                {[
                  { ic: <IconRewind10 size={28} />, label: "Назад 10 секунд" },
                  { ic: playing ? <IconPause size={34} /> : <IconPlay size={34} />, label: playing ? "Пауза" : "Смотреть" },
                  { ic: <IconForward10 size={28} />, label: "Вперёд 10 секунд" },
                  { ic: <IconSettings size={28} />, label: "Настройки" },
                  { ic: <IconClose size={28} />, label: "Выход" },
                ].map((b, i) => {
                  const f = ctrlZone === "buttons" && ctrlIdx === i;
                  return (
                    <button
                      key={i}
                      onClick={() => {
                        setCtrlZone("buttons");
                        setCtrlIdx(i);
                        if (i === 0) { seek(-10); bumpHideTimer(); }
                        else if (i === 1) { togglePlay(); bumpHideTimer(); }
                        else if (i === 2) { seek(10); bumpHideTimer(); }
                        else if (i === 3) { clearHideTimer(); setSettingsTab(0); setSettingsIdx(0); setOverlay("settings"); }
                        else { exit(); }
                      }}
                      className="inline-flex items-center justify-center rounded-full"
                      style={{ ...ringStyle(f, i === 1), width: i === 1 ? 68 : 54, height: i === 1 ? 68 : 54 }}
                      aria-label={b.label}
                    >
                      {b.ic}
                    </button>
                  );
                })}
              </div>
              <HintRow className="mt-5">
                {ctrlZone === "bar" ? (
                  <>
                    <Hint icon={<><IconChevronLeft size={16} /><IconChevronRight size={16} /></>}>перемотка</Hint>
                    <Hint icon={<IconChevronDown size={16} />}>кнопки</Hint>
                    <Hint icon={<IconOk size={16} />}>пауза</Hint>
                  </>
                ) : (
                  <>
                    <Hint icon={<><IconChevronLeft size={16} /><IconChevronRight size={16} /></>}>выбор</Hint>
                    <Hint icon={<IconOk size={16} />}>активировать</Hint>
                    <Hint icon={<IconChevronUp size={16} />}>таймлайн</Hint>
                    <Hint icon={<IconChevronDown size={16} />}>скрыть</Hint>
                  </>
                )}
              </HintRow>
            </div>
          )}

          {/* ── SETTINGS PANEL (Качество / Озвучка / Серии) ── overscan-safe. */}
          {overlay === "settings" && (
            <div className="absolute inset-0 z-20 flex items-end justify-center bg-black/60 backdrop-blur-md" style={{ padding: "4vh 4vw" }}>
              <div className="w-[760px] max-w-[90vw] rounded-2xl border border-white/10 bg-zinc-900/95 p-7">
                {/* Tabs */}
                <div className="mb-5 flex gap-3">
                  {([0, 1, ...(isSeries ? [2 as const] : []), 3 as const] as Array<0 | 1 | 2 | 3>).map((t) => {
                    const f = settingsTab === t;
                    const label = t === 0 ? "Качество" : t === 1 ? "Озвучка" : t === 2 ? "Серии" : "Скорость";
                    return (
                      <div key={t} className="rounded-xl px-5 py-2.5 text-base font-bold"
                        style={{ ...ringStyle(f, f), color: f ? "#0a0a0a" : "#a1a1aa" }}>
                        {label}
                      </div>
                    );
                  })}
                </div>
                {/* List — scrollable (max-height 60vh) so EVERY item is reachable;
                    the focused row scrollIntoView()s itself. */}
                <div className="overflow-y-auto" style={{ maxHeight: "60vh", scrollbarWidth: "none" }}>
                  {settingsTab === 0 && (
                    <div className="flex flex-col gap-2">
                      {qualities.length === 0 && <p className="text-muted-foreground">Нет вариантов</p>}
                      {qualities.map((q, i) => {
                        const f = settingsIdx === i;
                        const cur = q === quality;
                        return (
                          <button key={q} onClick={() => changeQuality(q)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-lg font-semibold"
                            style={ringStyle(f)}>
                            <span>{q}</span>{cur && <span className="text-sm" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>текущее</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {settingsTab === 1 && (
                    <div className="flex flex-col gap-2">
                      {playerDubs.length === 0 && <p className="text-muted-foreground">Одна озвучка</p>}
                      {playerDubs.map((t, i) => {
                        const f = settingsIdx === i;
                        const cur = t.id === translatorId;
                        return (
                          <button key={t.id} onClick={() => changeTranslator(t.id)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-lg font-semibold"
                            style={ringStyle(f)}>
                            <span>{t.name} {t.is_premium && "🔒"}</span>
                            {cur && <span className="text-sm" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>текущая</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {settingsTab === 2 && isSeries && (
                    <div className="grid grid-cols-2 gap-2">
                      {pickerEpisodes.map((ep, i) => {
                        const f = settingsIdx === i;
                        const cur = ep.episode_number === episode;
                        return (
                          <button key={ep.episode_number} onClick={() => playEpisode(season, ep.episode_number)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center gap-3 rounded-xl px-4 py-3 text-left"
                            style={ringStyle(f)}>
                            <span className="text-lg font-bold tabular-nums" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>{ep.episode_number}</span>
                            <span className="truncate text-base font-medium">{ep.name || `Серия ${ep.episode_number}`}</span>
                            {cur && <IconCheck size={18} className="ml-auto" style={{ color: f ? "#0a0a0a" : "var(--primary)" }} />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {settingsTab === 3 && (
                    <div className="flex flex-col gap-2">
                      {SPEEDS.map((s, i) => {
                        const f = settingsIdx === i;
                        const cur = s === speed;
                        return (
                          <button key={s} onClick={() => changeSpeed(s)}
                            ref={(node) => { if (f && node) node.scrollIntoView({ block: "nearest" }); }}
                            className="flex items-center justify-between rounded-xl px-5 py-3.5 text-left text-lg font-semibold"
                            style={ringStyle(f)}>
                            <span>{s === 1 ? "Обычная (1×)" : `${s}×`}</span>
                            {cur && <span className="text-sm" style={{ color: f ? "#0a0a0a" : "var(--primary)" }}>текущая</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <HintRow className="mt-4">
                  <Hint icon={<><IconChevronLeft size={16} /><IconChevronRight size={16} /></>}>вкладка</Hint>
                  <Hint icon={<><IconChevronUp size={16} /><IconChevronDown size={16} /></>}>выбор</Hint>
                  <Hint icon={<IconOk size={16} />}>применить</Hint>
                </HintRow>
              </div>
            </div>
          )}
        </>
      )}

      {/* TOAST */}
      {toast && (
        <div className="absolute bottom-10 left-1/2 z-40 -translate-x-1/2 rounded-xl border border-primary/30 bg-zinc-900/95 px-6 py-3 text-base font-semibold"
          style={{ color: "var(--primary)" }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes tvspin { to { transform: rotate(360deg); } }
        ::-webkit-scrollbar { display: none; }
      `}</style>
    </div>
  );
}
