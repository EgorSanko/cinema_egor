// Phase 2 — lightweight item-item collaborative filtering ("люди, которым
// зашёл X, любят и Y"). In-memory co-occurrence map, periodically flushed to
// ONE small bounded JSON file. No DB, and pruning caps the file size so it can
// never grow into a disk problem (we've been burned by unbounded growth).
import fs from "fs";
import path from "path";

const DATA_DIR =
  process.env.FEED_DATA_DIR ||
  (process.env.TICKETS_DIR
    ? path.join(path.dirname(process.env.TICKETS_DIR), "feed-data")
    : path.join(process.cwd(), "feed-data"));
const FILE = path.join(DATA_DIR, "cooc.json");

const MAX_NEIGHBORS = 60;   // top-N kept per item
const MAX_ITEMS = 8000;     // hard cap on tracked items
const FLUSH_MS = 20000;     // debounce disk writes

type Neigh = Map<number, number>;
let cooc: Map<number, Neigh> | null = null;
let dirty = false;
let flushTimer: ReturnType<typeof setInterval> | null = null;

function load(): Map<number, Neigh> {
  if (cooc) return cooc;
  cooc = new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(FILE, "utf-8")) as Record<string, Record<string, number>>;
    for (const [id, neigh] of Object.entries(raw)) {
      const m: Neigh = new Map();
      for (const [n, w] of Object.entries(neigh)) m.set(Number(n), w);
      cooc.set(Number(id), m);
    }
  } catch { /* first run / no file */ }
  if (!flushTimer) {
    flushTimer = setInterval(flush, FLUSH_MS);
    (flushTimer as unknown as { unref?: () => void }).unref?.();
  }
  return cooc;
}

function pruneItem(m: Neigh) {
  if (m.size <= MAX_NEIGHBORS) return;
  const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_NEIGHBORS);
  m.clear();
  for (const [n, w] of top) m.set(n, w);
}

function flush() {
  if (!dirty || !cooc) return;
  dirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const obj: Record<string, Record<string, number>> = {};
    for (const [id, m] of cooc) {
      const o: Record<string, number> = {};
      for (const [n, w] of m) o[n] = w;
      obj[id] = o;
    }
    const tmp = FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, FILE); // atomic
  } catch { /* disk full / readonly — skip, never throw into a request */ }
}

/** A user just positively engaged with `movieId`; bump its co-occurrence with
    the other titles that same user liked recently. */
export function recordPositive(movieId: number, otherPositives: number[]) {
  if (!movieId) return;
  const c = load();
  const bump = (a: number, b: number) => {
    let m = c.get(a);
    if (!m) {
      if (c.size >= MAX_ITEMS) return; // cap reached — don't grow further
      m = new Map();
      c.set(a, m);
    }
    m.set(b, (m.get(b) || 0) + 1);
    pruneItem(m);
  };
  for (const p of otherPositives) {
    if (!p || p === movieId) continue;
    bump(movieId, p);
    bump(p, movieId);
  }
  dirty = true;
}

/** CF affinity of a candidate to the user's liked titles, ~[0,1]. */
export function cfBoost(candidateId: number, userPositives: number[]): number {
  if (!userPositives?.length) return 0;
  const m = load().get(candidateId);
  if (!m) return 0;
  let s = 0;
  for (const p of userPositives) s += m.get(p) || 0;
  // squash so a couple of strong co-likes already give most of the boost
  return s > 0 ? Math.min(1, Math.log1p(s) / Math.log1p(8)) : 0;
}
