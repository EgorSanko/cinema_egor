# "TikTok for Movie Clips" — Technical Scoping

Context: Existing Next.js movie-streaming app. Backend resolves HLS streams from HDRezka per title. Metadata + recommendations from TMDB. Existing recommender uses watch history + TMDB `/recommendations`.

---

## 1. WHERE do the clips come from?

| Option | How | Pros | Cons | Verdict for your app |
|---|---|---|---|---|
| **(a) Auto-extract from the full HLS you already resolve** | `ffmpeg` pulls the stream → PySceneDetect segments scenes → heuristic picks N highlights → transcode to 9:16 short mp4 | You ALREADY have the full asset — zero extra content sourcing. Full creative control over length/aspect/captions. Every title in catalog is coverable. | Compute + storage cost. **Highest copyright exposure** (you're re-serving the actual film). Quality of auto-picks is mediocre without tuning. HDRezka stream availability/region flakiness. | **Primary engine.** It's the only option that gives wall-to-wall catalog coverage and is the differentiator. But see §5 — legally this is the spicy part. |
| **(b) TMDB / YouTube trailers + `/movie/{id}/videos` clips** | Call TMDB `videos` endpoint → filter `type` in {Trailer, Clip, Teaser, Featurette}, `site=YouTube` → embed YouTube IDs, no hosting | **Zero copyright liability** (YouTube/studio hosts it, you embed). Zero transcode/storage. Trivial to ship. Trailers are professionally cut = engaging by definition. | Not vertical (16:9 letterboxed in a 9:16 feed — ugly). Coverage gaps (older/obscure titles have no clips). You can't deep-link "watch full movie" from a YouTube iframe cleanly. Feels like a trailer reel, not "TikTok." | **Phase-1 filler + cold-start.** Use to bootstrap the feed and cover the head of the catalog for free while (a) backfills. |
| **(c) Curated / manual** | A human (you) marks in/out timestamps per title in an admin tool; pipeline cuts them | Best quality, lowest legal *volume* (few clips, defensible "promotional snippet" framing). | Doesn't scale past a few hundred titles. Labor. | Quality control layer on top of (a), not a standalone source. |
| **(d) User-submitted** | Users clip scenes themselves | Free labor, engagement loop, "best moments" surface organically. | Moderation burden, **worst legal position** (you're now a UGC host distributing infringing fragments — but DMCA safe harbor *may* apply if you're a passive host, unlike (a) where you're the uploader). Cold-start problem (no users → no clips). | Not for MVP. Revisit only if you have traffic + a moderation story. |

**Bottom line:** (a) is the engine, (b) is the bootstrap, (c) is the polish, (d) is later/never. Because you already hold the full streams, (a) is uniquely cheap for *you* on the content-acquisition axis — the cost moves entirely to compute, storage, and legal.

---

## 2. Making clips ENGAGING automatically — what actually works

Naive scene-cut + "pick N random scenes" produces boring clips. Real signal, ordered by effort/payoff:

### Cheap heuristics (ship these first)
- **Scene/shot-change rate (action proxy).** `ffmpeg`'s `select='gt(scene,0.4)'` filter and **PySceneDetect**'s `ContentDetector` give per-frame scene-change scores. A *burst* of rapid cuts = action/montage/climax. Pick windows with high local cut density. (PySceneDetect: https://www.scenedetect.com/docs/latest/api.html , https://github.com/Breakthrough/PySceneDetect)
- **Audio energy / loudness peaks.** Extract the audio track, compute RMS/loudness envelope (ffmpeg `ebur128` or librosa). Loud peaks correlate with action beats, stings, music swells, laughs. Cheap and surprisingly predictive.
- **Subtitle/dialogue density.** You can pull subtitles (HDRezka often has them, or Whisper them). **Dialogue density** is a strong "this is a *scene*, not a transition" signal. The 2025 *Smart-Trailer (S-Trailer)* work builds trailers purely from subtitle text features and classifies genre at 0.89 accuracy — proof subtitles alone carry a lot of signal. A spike of emotionally-charged dialogue (sentiment on the subtitle text) ≈ a memorable beat.
- **"Climax position" prior.** Empirically, trailer-worthy moments cluster in the **last ~20–30%** of a film (and a setup hook near the start). Weight your candidate windows by position. Trailers themselves famously avoid the *very* end (spoilers) — so down-weight the final 5%.

### Mid-effort (Phase 2)
- **Fight/action-scene classifier.** The 2024 *Fight Scene Detection* paper (BiLSTM over visual+motion features) hits **93.5% accuracy** detecting fight scenes specifically for highlight generation — beats 2D-CNN (92%) and 3D-CNN (65%). Drop-in for action-heavy catalogs. (https://arxiv.org/html/2406.05152v1)
- **Music-cue detection.** Onset/beat detection (librosa) to find score swells; align clip cut points to musical phrases so clips don't end mid-note.

### High-effort (only if it becomes a real product)
- **Learned "trailerness" models.** *Learning Trailer Moments with Co-Contrastive Attention* (ECCV 2020) trains directly on (movie, official-trailer) pairs to score how "trailer-like" each shot is — no manual labels, uses the studio's own trailer as the positive set. (https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123630290.pdf)
- **Trailer Generation Transformer (TGT)**, *Towards Automated Movie Trailer Generation* (2024): encoder-decoder, movie encoder contextualizes each shot via self-attention, autoregressive decoder predicts the next trailer shot. State-of-the-art but heavy. (https://arxiv.org/abs/2404.03477)

**Pragmatic recipe for MVP:** scene-detect to get candidate boundaries → score each candidate window by `w1*cut_density + w2*audio_peak + w3*dialogue_density + w4*position_prior` → non-max-suppress overlapping windows → take top-N, snap cut points to scene boundaries + musical/silence gaps → 8–20s each. This gets you 80% of the quality for ~5% of the effort of the learned models.

---

## 3. FEED architecture

```
[Batch clip pipeline]                 [Serving]
 full HLS (HDRezka) ──ffmpeg pull──▶ scenedetect ──score──▶ pick N windows
        │                                                       │
        └────────────────────── transcode 9:16, H.264 mp4 fast-start (+thumb)
                                                                │
                                                       ▼ object storage (S3/R2/Backblaze) + CDN
                                                                │
   clip_library (DB row per clip: id, tmdb_id, in/out, score, variants, thumb)
                                                                │
                              Feed API  ──orders clips──▶  Next.js vertical feed
                                  ▲                              │
                       recommendation engine            swipe UI + player pool
                       (TMDB recs + watch history)              │
                                                        "Watch full movie" CTA
                                                        deep-links existing player
```

### Pipeline (offline)
- Workers (your existing Celery/Redis-style stack, or a simple queue) consume a job per title: pull stream → detect → score → cut → transcode → upload → write `clip` rows.
- Output **progressive single-bitrate H.264 MP4 with `+faststart`** (moov atom front-loaded), NOT HLS. For 8–20s clips the HLS manifest overhead loses; progressive MP4 from CDN plays faster. (TikTok-feed design confirms this: https://www.techinterview.org/post/3233474985/design-tiktok-video-feed-mobile/ ; Mux's RN feed write-up: https://www.mux.com/blog/slop-social). Add H.265 variant for newer devices (~30% smaller) with H.264 fallback.
- Generate a **poster JPG + a tiny "preview" MP4** (first ~1s) for instant first-frame.

### Feed API
- `GET /feed?cursor=...` → returns an ordered page of clip descriptors (clip URL, poster, tmdb_id, title, runtime offset for deep-link, captions).
- Ordering = **personalization layer over the clip library** (see below). Stateless-ish: precompute a per-user candidate ordering, paginate with a cursor, dedupe already-seen via a seen-set (Redis).

### Vertical swipe UI (Next.js)
- **Player pool of 3** (prev/current/next), reassigned on scroll — eliminates cold-start. (techinterview design)
- **Prefetch the next clip to ~500KB or first ~2s**, in scroll direction (prefetch 1–2 ahead, not 5, since these are tiny). On cellular/data-saver: lower bitrate, pause prefetch, autoplay-on-tap only.
- **Autoplay muted** (browser policy), unmute on tap. Show poster/preview-mp4 frame instantly while the real clip buffers. Target <500ms to first frame.
- Each card: title, "Watch full movie" CTA, like/save, "more like this."

### "Watch full movie" CTA — deep link
- Store the clip's source `(tmdb_id, in_timestamp)`. CTA routes to your existing player route, e.g. `/watch/{tmdb_id}?t={in_timestamp}` so it can optionally **resume at the scene the clip came from** (or start from 0). You already resolve HDRezka HLS per title in the player — the CTA is just a normal navigation into that route. This is the conversion mechanic of the whole feature.

### Personalization (reuse what you have)
You don't need a new ML system. Compose existing signals:
1. **Watch-history affinity:** genres/titles the user watched → boost clips from similar titles (you already compute this for recs).
2. **TMDB `/recommendations` + `/similar`:** for each recently-watched title, pull recommended titles → their clips get a boost.
3. **In-feed feedback loop:** watch-through %, replays, likes, saves per clip → online boost/penalty (the strongest signal once you have traffic; TikTok's edge is watch-time, not stated prefs).
4. **Exploration:** mix in ~20% popular/diverse clips to avoid filter-bubble collapse and cover cold-start users (who get popularity-ordered + trending).

Scoring: `final = recsAffinity * w1 + freshness * w2 + clipQualityScore * w3 + engagementPrior * w4`, then dedupe by title so the feed isn't 5 clips of one movie. This is a re-rank over the library, cheap to compute per request or per session.

---

## 4. Cost & scale

**Transcode cost (the scary-looking number that isn't):**
- Self-hosted `ffmpeg` (you already run your own infra): roughly **$0.04–0.08 per *output* minute** on cloud CPU, far less on a box you already pay for. Managed (AWS MediaConvert) ≈ **$0.0075–0.015/output-min** for the encode itself but you pay per-minute forever and it's metadata-multiplied. Break-even favors self-host above ~4–5k output-min/month. (https://32blog.com/en/ffmpeg/ffmpeg-vs-aws-mediaconvert-cost)
- **But output minutes are tiny here.** 10 clips × 15s = 2.5 output-min **per title**. A 5,000-title catalog = ~12,500 output-min total, one-time. At even $0.08/min that's **~$1,000 one-time** for the whole catalog (less on your own hardware). The *input decode* (pulling + scene-detecting the full 90-min film) is the real CPU cost, not the encode — budget for that (scene detection on CPU is roughly real-time-ish; GPU/NVENC speeds the encode, PySceneDetect is the bottleneck).

**Storage:** a 15s 9:16 H.264 clip ≈ 1–3 MB. 5,000 titles × 10 clips × 2 MB ≈ **~100 GB**. On Cloudflare R2 / Backblaze B2 that's **a few dollars/month**, egress-free on R2. Negligible.

**Batch vs lazy on-demand:**
- **Lazy/on-demand (recommended start):** only clip a title the *first time* it's about to enter someone's feed (or first time it's watched). Cache the result forever. You never pay to clip the long tail nobody sees. Adds first-request latency (clip job must run) — mitigate by clipping **popular + recently-watched titles** in a warm background batch and lazy-filling the rest.
- **Full batch:** simpler ordering/quality control, but you pay decode cost for titles no one opens. Given the long-tail nature of catalogs, **lazy + popularity-warmed batch** is the right call.

---

## 5. LEGAL reality — be blunt

- **Auto-clipping and self-hosting fragments of films = direct copyright infringement of the reproduction + public-performance/distribution rights.** Short length and "it's promotional" do **not** make it fair use when you're a commercial service serving fragments of *entire commercial catalogs at scale*. Fair use is a case-by-case defense, not a volume license. You'd be making + distributing derivative works of thousands of copyrighted films.
- **How Netflix Fast Laughs / Clips avoids this entirely:** the clips are **first-party / licensed**. Netflix either owns the originals or its catalog licenses already grant the right to make and show promotional excerpts. They're cutting clips from content they already have distribution rights to. Their feed is a *marketing surface for licensed inventory* — zero incremental rights problem. (TechCrunch on Fast Laughs: https://techcrunch.com/2021/03/03/netflixs-latest-experiment-is-a-tiktok-like-feed-of-funny-videos/ ; Netflix Clips 2026: https://techcrunch.com/2026/04/30/netflix-wants-you-to-watch-clips-its-tiktok-like-vertical-video-feed/ ). You have **none** of those rights.
- **Your situation is materially worse than Netflix's** because the *whole app* streams via **HDRezka** — an unlicensed pirate source. You have no license to the full films, so you certainly have no license to make derivative clips. Adding an auto-clip feed (option **a/d**) doesn't create *new* legal jeopardy relative to the streaming you already do — but it **amplifies surface area, indexability, and "willful distribution" optics**: discrete, hosted, transcoded, watermark-free MP4 files sitting in your bucket are far easier for a rights-holder/anti-piracy vendor to fingerprint (e.g., audio/video hashing) and issue takedowns/claims against than ephemeral proxied HLS. Option **(d)** UGC could *theoretically* get DMCA safe-harbor as a passive host — but only if you don't also stream the films yourself, which you do, so that shield is unavailable to you in practice.
- **The only low-risk content source is (b): embed TMDB/YouTube official trailers & clips.** Those are studio-published on YouTube; embedding (not re-hosting) carries essentially the same liability profile as any site embedding a YouTube video — i.e., low. The trade-off is you lose vertical format, full coverage, and the "watch full movie from this exact scene" magic.

**Honest framing for the decision:** if the app is already operating in the gray/black zone via HDRezka, option (a) is a *product* win and an *incremental* (not categorical) legal increase. If you ever want to go legitimate, (b) is the only feature you can keep. Decide which world you're building for before investing in the clip pipeline.

---

## Recommended phased MVP

**Phase 0 — Decide the legal posture.** Pick (b)-only (defensible) vs (a)-primary (product-max, higher exposure). Everything below assumes you proceed; Phase 1 is structured so the *feed product* is validated before you spend on the risky pipeline.

**Phase 1 — Cheapest path to a working feed (no transcoding, ~days):**
- Build the vertical swipe UI + Feed API + player pool + deep-link CTA — the whole *product shell*.
- Source clips from **TMDB `/movie/{id}/videos`** (trailers/clips/teasers, `site=YouTube`), embedded. Zero hosting, zero transcode, zero new legal exposure.
- Order with your **existing recommender** (watch history + TMDB recs) + popularity for cold start.
- Ship. Measure swipe-through, watch-time, and CTA → full-movie conversion. This tells you if the *feature* works before you build the expensive engine.

**Phase 2 — Add the auto-clip engine for coverage & vertical UX:**
- Pipeline: `ffmpeg` pull → **PySceneDetect** `ContentDetector` → MVP heuristic score (`cut_density + audio_peak + dialogue_density + position_prior`) → cut top-N → transcode 9:16 H.264 `+faststart` + poster → R2/B2 + CDN → `clip` rows.
- **Lazy on-demand** generation, warm-batch the top popular/recently-watched titles. Mix auto-clips into the (b) feed, A/B which converts better.

**Phase 3 — Quality & personalization:**
- Better highlight selection (fight/action classifier; optionally co-contrastive "trailerness"). Online engagement re-rank (watch-through, replays, saves). Curated overrides (option c) for hero titles. H.265 variants. Captions burned from subtitles/Whisper.

---

## Sources
- PySceneDetect — https://github.com/Breakthrough/PySceneDetect , API: https://www.scenedetect.com/docs/latest/api.html
- ffmpeg scene-change `select` filter (scene detection) — https://ffmpeg.org/ffmpeg-filters.html#select_002c-aselect
- Towards Automated Movie Trailer Generation (TGT, 2024) — https://arxiv.org/abs/2404.03477
- Learning Trailer Moments with Co-Contrastive Attention (ECCV 2020) — https://www.ecva.net/papers/eccv_2020/papers_ECCV/papers/123630290.pdf
- Fight Scene Detection for Movie Highlight Generation (2024) — https://arxiv.org/html/2406.05152v1
- TMDB movie videos endpoint — https://developer.themoviedb.org/reference/movie-videos
- Netflix Fast Laughs (TechCrunch) — https://techcrunch.com/2021/03/03/netflixs-latest-experiment-is-a-tiktok-like-feed-of-funny-videos/
- Netflix Clips vertical feed 2026 (TechCrunch) — https://techcrunch.com/2026/04/30/netflix-wants-you-to-watch-clips-its-tiktok-like-vertical-video-feed/
- TikTok-style feed design (prefetch/player pool/MP4-vs-HLS) — https://www.techinterview.org/post/3233474985/design-tiktok-video-feed-mobile/
- Mux RN TikTok-style feed (prefetch in scroll direction) — https://www.mux.com/blog/slop-social
- ffmpeg vs AWS MediaConvert cost — https://32blog.com/en/ffmpeg/ffmpeg-vs-aws-mediaconvert-cost
