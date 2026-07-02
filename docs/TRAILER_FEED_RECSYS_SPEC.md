# Infinite Trailer Feed — Recommendation System Spec

TikTok-style infinite feed of movie trailers that learns taste from implicit behavior.
Stack: Next.js frontend, FastAPI/Python backend, Postgres, Redis, existing TMDB metadata + basic recommender.

Grounding (real practitioner advice):
- Watch-time relative to length + completion rate are the dominant TikTok signals; final rank = weighted sum of predicted engagement actions. https://www.brainforge.ai/blog/how-tiktok-uses-machine-learning-to-keep-you-scrolling
- Empirical personalization factors on TikTok (skip / watch-to-end dominate). https://arxiv.org/pdf/2201.12271
- Watch-time as implicit interest proxy + causal labeling pitfalls. https://arxiv.org/pdf/2306.17426 , https://arxiv.org/pdf/2508.11086
- "Implicit signals beat explicit ones (almost always)" — Xavier Amatriain, lessons from real recsys. https://www.slideshare.net/xamat/recsys-2016-tutorial-lessons-learned-from-building-reallife-recommender-systems
- Contextual bandits handle cold start / explore-exploit at scale. https://dl.acm.org/doi/10.1145/3554819 , https://arxiv.org/pdf/1908.06158
- Phase 2 CF: implicit ALS confidence weighting C=1+alpha*r. https://github.com/benfred/implicit (Hu/Koren/Volinsky "Collaborative Filtering for Implicit Feedback Datasets")
- Phase 3 sequential: SASRec self-attention. (BERT4Rec/SASRec)

---

## 1. Signal logging

Capture per **impression** (one trailer shown in the feed). Client emits ONE summary event when the card leaves the viewport (or on play of the full film), plus lightweight progress beacons.

### Client events (per trailer impression)

| field | type | meaning |
|---|---|---|
| `impression_id` | uuid | client-generated, dedupe key |
| `user_id` | int | |
| `movie_id` | int | TMDB id |
| `trailer_key` | str | YouTube/TMDB video key |
| `trailer_len_s` | float | trailer duration |
| `shown_at` | ts | when card became >=50% visible |
| `dwell_ms` | int | total ms card was the active/visible item |
| `watch_ms` | int | actual video playback ms (sum, handles pause) |
| `pct_watched` | float | `watch_ms / (trailer_len_s*1000)`, clamp 0..1 |
| `completed` | bool | reached >=95% of trailer |
| `replays` | int | times the trailer looped/was replayed |
| `fast_skip` | bool | swiped away with `dwell_ms < 2000` |
| `muted` | bool | watched with sound off (weak signal) |
| `tap_watch` | bool | tapped "Смотреть" (open film / detail / provider) |
| `play_full` | bool | actually started the full film |
| `liked` | bool | tapped like/save |
| `not_interested` | bool | tapped "Не интересно" |
| `position` | int | index in the served page (for position-bias debiasing later) |

Beacon strategy: `navigator.sendBeacon` on `visibilitychange` + on swipe. Buffer events client-side and flush in batches of ~10 to `POST /events`. Idempotent on `impression_id`.

### Per-impression reward score (TikTok-style)

Completion% and watch-time dominate; tap-through is the gold signal; fast-skip is a strong negative. All terms combine into a single scalar `r` used to update the taste vector and (Phase 1) as the bandit reward.

```
# inputs already clamped
pct      = clamp(pct_watched, 0, 1)
r  = 0.0

# 1. Watch depth (dominant, smooth) — completion% is the backbone
r += 1.0 * pct                      # linear watch fraction
r += 0.8 * (pct >= 0.95)            # finished trailer bonus
r += 0.3 * (pct >= 0.5)            # got past the hook

# 2. Gold signal: intent to actually consume the film
r += 2.5 * tap_watch               # tapped "Смотреть" / opened film
r += 4.0 * play_full               # actually started the full movie

# 3. Explicit positives
r += 1.5 * liked                   # like / save
r += 0.6 * min(replays, 2) * 0.5   # replays => loved the trailer (cap)

# 4. Strong negatives
r -= 1.2 * fast_skip               # swiped in <2s = clear "no"
r -= 2.5 * not_interested          # explicit kill
r -= 0.3 * (dwell_ms < 1000 and not fast_skip)  # glance-and-gone

# normalize to ~[-3, +8]; store raw r AND a squashed reward in [-1,1]
reward = tanh(r / 3.0)
```

Notes grounded in research:
- `pct`-based completion beats raw watch_ms (a finished 60s trailer should not dominate a finished 90s one) — TikTok weights completion *relative to length*.
- `tap_watch`/`play_full` are sparse but high-value: they are the conversion the product actually cares about, so they get the biggest weights.
- `fast_skip < 2s` is the cheapest, highest-volume negative — TikTok treats skip-before-hook as the core "not for you" signal.
- Debias note (Phase 1.5): down-weight skips at `position 0` slightly and ignore impressions with `dwell_ms < 250` (never really seen) to avoid teaching the model from non-exposures.

---

## 2. The model, phased

### Phase 1 — cheap & instant (this spec, ~1-2 weeks)
1. **Content vectors per movie** from TMDB: multi-hot genres, top-K keywords, top-N cast/director, decade bucket, log-popularity, log-vote-count, language. One-hot/TF-IDF then L2-normalize -> `item_vec` (~200-500 dims sparse, or hash to 256 dense).
2. **Online per-user taste vector** `taste_vec` same space. Updated every swipe with reward-weighted EMA:
   `taste = (1-lr*|reward|) * taste + lr * reward * item_vec`, `lr≈0.15`. Positive reward pulls toward the item, negative pushes away. Re-normalize.
3. **Contextual bandit** for ranking + explore/exploit + cold start. Use **LinUCB-lite** per genre-arm OR simpler epsilon-greedy with UCB-style novelty bonus (see §4). The "context" is `taste_vec`; the score is `taste·item_vec` + exploration bonus.

Why first: no interaction history required, updates are O(dim) per swipe so the feed feels *instantly* adaptive, and it solves cold start by construction. "Implicit signals beat explicit" + content features are the standard day-1 baseline.

### Phase 2 — collaborative filtering (once you have data: ~weeks of logs, ≥ a few thousand interaction rows)
- Train **implicit ALS** (benfred/implicit) on the `(user, movie, confidence)` matrix where confidence `C = 1 + alpha * positive_reward_sum` (Hu/Koren/Volinsky). Or run **Gorse** as a drop-in engine.
- Produces a CF score per (user, movie). **Blend** with content score (see §5). Retrain nightly/offline; serve precomputed user/item factors from Redis.

Why second: CF needs a critical mass of overlapping user-item interactions to beat content. It captures "people like you also loved X" patterns content can't (taste neighborhoods, sleeper hits). Pointless before you have interactions.

### Phase 3 — sequential model (only if metrics plateau)
- **SASRec** (self-attention over the user's recent swipe sequence) to model *order* and short-term intent ("just watched 3 horror trailers -> wants more horror now, not their all-time average").
- Heavy: needs GPU-ish training, sequence logging, serving infra.

Why last: it's the biggest lift for the smallest marginal gain until you've maxed out content+CF. Only worth it when you can measure that session-context matters and the EMA taste vector is too slow/too averaged.

---

## 3. Cold start (brand-new user)

Goal: useful feed from swipe 0, converged taste within ~10-20 swipes.

- **Seed feed** = popularity ∩ diversity: top trailers by `popularity * recency`, but force genre/decade spread (no two adjacent cards same primary genre). Inject 1-2 "broad crowd-pleasers" per 5.
- **Fast taste probing**: first ~12 cards are an *exploration schedule* — deliberately span the main genre axes (action, drama, comedy, horror, sci-fi, romance, animation, thriller). Each swipe's reward snaps `taste_vec` toward/away from that genre cluster.
- **Convergence**: because `lr≈0.15` and rewards are signed, ~10 informative swipes move `taste_vec` most of the way. After ~12 cards, drop exploration epsilon from 0.4 → 0.15 (decay `eps = max(0.1, 0.4 * 0.92^n)`), so exploit dominates.
- Use any known prior (existing recommender's watch-history rec, or signup genre pick) to *initialize* `taste_vec` instead of zeros — collapses cold start further.

---

## 4. Infinite feed mechanics

Pipeline per `GET /feed` page:

1. **Candidate pool** (~300-500): union of
   - existing recommender output (TMDB /recommendations + watch-history recs),
   - "more like recently-rewarded movies" (nearest items to high-reward swipes),
   - popularity/trending bucket (for exploration & cold start),
   - a random novelty bucket.
   Pull from a Redis-cached pool; refresh per session.
2. **Score** each candidate: `final = score(user, movie)` (see §5).
3. **Explore/exploit** — epsilon-greedy + novelty bonus:
   ```
   for each candidate:
       u = final_score
       novelty = beta / (1 + times_genre_shown_this_session)   # UCB-ish curiosity
       u += novelty
   with prob eps: pick from softmax over scores (explore)
   else:          pick top (exploit)
   eps = max(0.10, 0.40 * 0.92^swipes_seen)
   ```
4. **Diversity / dedupe**:
   - **Never repeat a `movie_id`** the user has already been *served* (persistent `served` set per user in Redis; also exclude `not_interested` + already-watched-full).
   - **MMR-style genre mixing**: greedily build the page penalizing a candidate by similarity to items already placed in the page, so the feed never tunnels into one genre. Hard rule: no 3 consecutive same-primary-genre cards.
5. **Cursor pagination**: opaque cursor encodes `{user_id, session_id, served_count, eps_state, pool_version}`. Page size 10.
6. **Prefetch**: server returns N=10; client prefetches trailer thumbnails/keys for the next 5 while user is on card i. Request next page when 3 cards from the end.

Never-ending without repeats: pool is large + continuously refreshed from TMDB; once the `served` set gets large, relax constraints (allow re-surfacing high-reward-but-not-tapped titles after a long cooldown, e.g. 200 swipes). There are tens of thousands of eligible trailers, so exhaustion is not a practical concern.

---

## 5. Integrate with the EXISTING recommender (don't replace)

The existing recommender (watch-history + TMDB /recommendations) becomes the **candidate generator** and a **scoring feature**, not the ranker.

```
final_score(user, movie) =
      w_content * cos(taste_vec, item_vec)          # Phase 1, online, fast-adapting
    + w_existing * norm(existing_rec_score)         # their current recommender
    + w_pop      * norm(log_popularity)             # tie-break / cold start
    + w_cf       * cf_score(user, movie)            # Phase 2 only, else 0
# Phase 1 weights:
w_content=0.55, w_existing=0.30, w_pop=0.15, w_cf=0.0
# Phase 2 weights:
w_content=0.35, w_existing=0.20, w_pop=0.10, w_cf=0.35
```

So day 1 the existing system contributes both candidates and 30% of the score; as the online taste vector and later CF prove out, you shift weight toward them. Nothing is thrown away.

---

## 6. Metrics to watch

Per-user and global, dashboard daily:
- **Swipe-through rate** = swipes / impressions (engagement velocity; want healthy but not frantic).
- **Avg % watched** per impression (the core implicit reward; primary north star).
- **Completion rate** = share of impressions with `completed` (pct≥0.95).
- **Fast-skip rate** (<2s) — want it falling as taste converges.
- **Tap-through-to-watch conversion** = `tap_watch / impressions` and `play_full / tap_watch` (the gold product metric).
- **Like/save rate**, **not-interested rate**.
- **Time-to-converge**: swipes until avg-reward of a rolling window of 5 stabilizes (target 10-20).
- **Diversity**: distinct genres per 20 cards (guard against tunneling/filter bubble).
- Guardrail: session length & D1/D7 retention (the thing the reward is a proxy *for*).

---

## 7. Phase-1 concrete build (solo dev, ~1-2 weeks)

### Data model (Postgres)

```sql
-- raw event log (append-only, one row per impression summary)
CREATE TABLE feed_events (
  impression_id  uuid PRIMARY KEY,
  user_id        int  NOT NULL,
  movie_id       int  NOT NULL,
  trailer_key    text,
  trailer_len_s  real,
  shown_at       timestamptz NOT NULL,
  dwell_ms       int,
  watch_ms       int,
  pct_watched    real,
  completed      bool,
  replays        int  DEFAULT 0,
  fast_skip      bool DEFAULT false,
  muted          bool DEFAULT false,
  tap_watch      bool DEFAULT false,
  play_full      bool DEFAULT false,
  liked          bool DEFAULT false,
  not_interested bool DEFAULT false,
  position       int,
  reward         real,            -- computed server-side (squashed)
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX ON feed_events (user_id, created_at DESC);

-- precomputed item content vectors (rebuilt offline when TMDB metadata changes)
CREATE TABLE item_vectors (
  movie_id int PRIMARY KEY,
  vec      bytea,          -- packed float32[256] (L2-normalized)
  popularity real,
  primary_genre text,
  updated_at timestamptz DEFAULT now()
);

-- live per-user taste vector (updated every swipe)
CREATE TABLE user_taste (
  user_id    int PRIMARY KEY,
  vec        bytea,        -- packed float32[256]
  swipes     int DEFAULT 0,
  eps        real DEFAULT 0.40,
  updated_at timestamptz DEFAULT now()
);
```
Redis: `served:{user_id}` (set of movie_ids), `pool:{session_id}` (candidate list), and hot copies of taste vectors. Vectors can also live entirely in Redis for speed; Postgres is the durable store.

### API shape

```
POST /events
  body: { events: [ <impression summary>, ... ] }   # batched, idempotent on impression_id
  -> for each: compute reward, update user_taste (reward-weighted EMA), mark served, decay eps
  -> 202 Accepted

GET /feed?cursor=<opaque>&limit=10
  (no cursor on first call = new session)
  1. load taste_vec, eps, served-set
  2. build/refresh candidate pool (Redis-cached)
  3. score candidates (final_score), add novelty bonus
  4. epsilon-greedy select + MMR diversity + dedupe vs served
  5. return:
     {
       items: [ { movie_id, title, trailer_key, trailer_len_s, poster, genres, reason } ... ],
       cursor: "<opaque next cursor>",
       prefetch: [ next 5 trailer_keys ]
     }
```

### Online taste update (server, per event)
```python
def update_taste(taste, item_vec, reward, lr=0.15):
    taste = (1 - lr*abs(reward)) * taste + lr * reward * item_vec
    n = np.linalg.norm(taste)
    return taste / n if n > 0 else taste
```

### Explore/exploit rule (Phase 1)
- Maintain `eps` per user, decayed `eps = max(0.10, 0.40 * 0.92^swipes)`.
- For each served page: with prob `eps` sample a slot from softmax(scores/temperature) (explore); otherwise take argmax of remaining (exploit). Always apply the genre-novelty bonus and the no-3-in-a-row diversity rule. First ~12 swipes follow the fixed genre-probe exploration schedule regardless of eps.

### Build order for the 1-2 weeks
1. Day 1-2: `feed_events` + `POST /events` + client beaconing + reward function.
2. Day 3-4: offline job building `item_vectors` from TMDB (genres/keywords/cast/decade/popularity).
3. Day 5-6: `user_taste` + online EMA update wired into `/events`.
4. Day 7-9: `GET /feed` — candidate pool (reuse existing recommender), scoring, MMR diversity, dedupe, cursor, prefetch.
5. Day 10-12: epsilon-greedy + cold-start probe schedule + metrics dashboard.
6. Phase 2 (later): nightly implicit-ALS job, add `cf_score`, reweight.
