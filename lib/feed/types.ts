// Shared contract for the MovieTok trailer feed (Phase 1).
// Design: STATELESS server. The user's taste vector lives in the browser
// (localStorage); the client sends it with each request and the server ranks
// a fresh candidate pool against it. No DB, no per-user server state — fits
// the app's localStorage-centric model and deploys inside the Next standalone.

export interface FeedTrailer {
  movieId: number;
  title: string;
  year: string;
  poster: string | null;     // path for /tmdb-img (e.g. "/abc.jpg")
  overview: string;
  voteAverage: number;
  genreIds: number[];
  decade: number;            // e.g. 2010
  ytKey: string;             // YouTube trailer id (embeddable)
}

// Learned per-user taste. Weights accumulate via reward-weighted EMA.
export interface TasteVector {
  genres: Record<number, number>;  // genreId -> weight
  decades: Record<number, number>; // decade  -> weight
  n: number;                       // events folded in
}

// One impression's implicit signals, captured client-side.
export interface SignalEvent {
  movieId: number;
  genreIds: number[];
  decade: number;
  dwellMs: number;
  pctWatched: number;       // 0..1 of the trailer watched
  completed: boolean;       // watched to end
  fastSkip: boolean;        // swiped away < 2s
  tapWatch: boolean;        // pressed «Смотреть»  (gold signal)
  playedFull: boolean;      // actually started the full movie
  liked: boolean;
  saved: boolean;
  notInterested: boolean;
}

// TikTok-weighted reward: watch time + completion are the backbone; tapping
// «Смотреть» / actually watching is gold; fast-skip & "not interested" are the
// strong negatives; likes are weak (low-friction). Squashed to [-1,1].
export const REWARD_WEIGHTS = {
  pctWatched: 1.0,
  completed: 0.8,
  tapWatch: 2.5,
  playedFull: 4.0,
  liked: 0.5,
  saved: 0.8,
  fastSkip: -1.2,
  notInterested: -2.5,
} as const;

// EMA learning rate for folding a reward into the taste vector.
export const TASTE_LR = 0.18;

// API: POST /api/feed
export interface FeedRequest {
  taste: TasteVector | null;  // null on first ever visit (cold start)
  seen: number[];             // movieIds already shown (dedupe)
  positives?: number[];       // movieIds the user liked/tapped (Phase 2 CF)
  n?: number;                 // batch size (default 8)
}
export interface FeedResponse {
  items: FeedTrailer[];
}

export function emptyTaste(): TasteVector {
  return { genres: {}, decades: {}, n: 0 };
}
