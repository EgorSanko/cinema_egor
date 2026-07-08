// Yandex.Metrika watch heartbeat.
//
// Metrika measures a visit's duration as the time between its first and LAST
// hit. The player page is the last page of almost every visit, and time spent
// on the last page counts as ZERO unless the page keeps sending hits. So a
// two-hour watch used to register as ~0s and dragged avgVisitDuration down to
// tens of seconds (the weekly report showed "1:25 на сайте" for a site where
// people watch full movies).
//
// Fix: while a video is actually playing, send a lightweight goal hit at most
// once per minute. Each hit pushes the visit's last-activity timestamp forward,
// so the measured duration tracks real watch time. Throttled to 60s so a long
// film produces a bounded number of hits, and guarded so it's a no-op if the
// counter script hasn't loaded yet or we're server-side.
const YM_ID = 110041488;
const INTERVAL_MS = 60_000;
let lastBeat = 0;

export function watchHeartbeat(): void {
  if (typeof window === "undefined") return;
  const ym = (window as unknown as { ym?: (...a: unknown[]) => void }).ym;
  if (typeof ym !== "function") return;
  const now = Date.now();
  if (now - lastBeat < INTERVAL_MS) return;
  lastBeat = now;
  try { ym(YM_ID, "reachGoal", "watch_active"); } catch {}
}
