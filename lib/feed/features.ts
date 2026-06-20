// Phase-1 recommender math (pure, framework-free). Runs on BOTH client
// (taste update per swipe) and server (scoring the candidate pool).
import {
  type TasteVector, type SignalEvent, type FeedTrailer,
  REWARD_WEIGHTS as W, TASTE_LR, emptyTaste,
} from "./types";

/** Implicit reward in [-1, 1] for one impression (TikTok-weighted). */
export function computeReward(e: SignalEvent): number {
  let r = 0;
  r += W.pctWatched * (e.pctWatched || 0);
  if (e.completed) r += W.completed;
  if (e.tapWatch) r += W.tapWatch;
  if (e.playedFull) r += W.playedFull;
  if (e.liked) r += W.liked;
  if (e.saved) r += W.saved;
  if (e.fastSkip) r += W.fastSkip;
  if (e.notInterested) r += W.notInterested;
  return Math.tanh(r / 3); // squash to [-1, 1]
}

/** Fold one impression into a taste vector via reward-weighted EMA. `lr`
    controls adaptation speed — long-term taste uses the slow default; the
    short-term SESSION vector (Phase 3 sequential intent) uses a higher lr so
    it tracks "what you're into right now in this session". */
export function updateTaste(
  taste: TasteVector | null, e: SignalEvent, lr: number = TASTE_LR
): TasteVector {
  const t: TasteVector = taste
    ? { genres: { ...taste.genres }, decades: { ...taste.decades }, n: taste.n }
    : emptyTaste();
  const r = computeReward(e);
  for (const g of e.genreIds || []) {
    t.genres[g] = (t.genres[g] || 0) * (1 - lr) + r * lr;
  }
  if (e.decade) {
    t.decades[e.decade] = (t.decades[e.decade] || 0) * (1 - lr) + r * lr;
  }
  t.n += 1;
  return t;
}

/** Blend long-term taste with the short-term session vector (Phase 3). The
    session leans the feed toward in-the-moment intent without erasing who you
    are. Returns the long-term vector unchanged when there's no session yet. */
export function blendTaste(
  longT: TasteVector | null, sessionT: TasteVector | null, w = 0.6
): TasteVector | null {
  if (!sessionT || sessionT.n === 0) return longT;
  if (!longT || longT.n === 0) return sessionT;
  const genres: Record<number, number> = { ...longT.genres };
  for (const [g, v] of Object.entries(sessionT.genres)) {
    const gi = Number(g);
    genres[gi] = (genres[gi] || 0) * (1 - w) + v * w;
  }
  const decades: Record<number, number> = { ...longT.decades };
  for (const [d, v] of Object.entries(sessionT.decades)) {
    const di = Number(d);
    decades[di] = (decades[di] || 0) * (1 - w) + v * w;
  }
  return { genres, decades, n: Math.max(longT.n, sessionT.n) };
}

/** Affinity of an item to the taste vector. Cold start (n small) leans on the
    movie's own quality/popularity so the feed isn't random before we know you. */
export function scoreItem(taste: TasteVector | null, item: FeedTrailer): number {
  const quality = ((item.voteAverage || 0) / 10) * 0.5; // 0..0.5 prior
  if (!taste || taste.n === 0) return quality + Math.random() * 0.15;

  let aff = 0, k = 0;
  for (const g of item.genreIds || []) {
    if (g in taste.genres) { aff += taste.genres[g]; k++; }
  }
  if (item.decade in taste.decades) { aff += taste.decades[item.decade] * 0.5; k += 0.5; }
  const genreAff = k > 0 ? aff / k : 0; // ~[-1, 1]

  // As we learn (n grows), weight taste more and the quality prior less.
  const conf = Math.min(1, taste.n / 15);
  return genreAff * conf + quality * (1 - conf * 0.6);
}

/** Re-rank for diversity: greedily avoid 3 same-genre in a row so the feed
    doesn't tunnel into one topic (TikTok-style interspersing). */
export function diversify(items: FeedTrailer[]): FeedTrailer[] {
  const out: FeedTrailer[] = [];
  const pool = items.slice();
  while (pool.length) {
    const lastTwo = out.slice(-2);
    let pick = pool.findIndex(it => {
      if (lastTwo.length < 2) return true;
      const g = new Set(it.genreIds);
      const clash = lastTwo.every(p => p.genreIds.some(x => g.has(x)));
      return !clash;
    });
    if (pick === -1) pick = 0; // nothing better — take the top
    out.push(pool.splice(pick, 1)[0]);
  }
  return out;
}
