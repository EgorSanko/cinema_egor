from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import httpx

import hdrezka.api.http as hdrezka_http
hdrezka_http.DEFAULT_CLIENT = httpx.AsyncClient(
    headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"},
    follow_redirects=True,
    timeout=25.0,
    verify=False,
)

from hdrezka.url import Request
Request.HOST = "https://hdrezka.cm/"

from hdrezka import Search
from hdrezka.stream import PlayerSeries

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

logged_in = False

# Short-TTL cache for /api/search. The HDRezka resolve takes ~2-3s (it fetches
# the post page to probe premium dubs, then resolves the stream); caching the
# parsed result makes prefetch→click and repeat opens near-instant. TTL is kept
# short because HDRezka stream URLs can carry expiring CDN tokens — long caching
# would hand out dead links.
import time as _time
import asyncio as _asyncio
_search_cache: dict = {}
_SEARCH_CACHE_TTL = 300  # seconds
# Single-flight: coalesce concurrent identical resolves into ONE upstream call.
# The page fires two identical searches on load (player prefetch + download
# button), and many users can open the same new title at once — without this
# each would hit HDRezka separately (~2-3s, rate-limit risk).
_inflight: dict = {}
# Premium-status cache keyed by post URL. The premium probe fetches the full
# title page (~130KB) — the single biggest chunk of cold-resolve latency
# (~1-2s). Premium status of a title's dubs changes rarely, so memoize it for
# hours. Huge win for series (same page, many episodes) and repeat opens.
_prem_cache: dict = {}
_PREM_TTL = 6 * 3600  # seconds

def _cache_store(key, resp):
    # Only cache real hits — never errors / "not found", so a transient failure
    # doesn't get pinned for 5 minutes.
    if isinstance(resp, dict) and resp.get("stream"):
        _search_cache[key] = (_time.monotonic(), resp)
    return resp

async def ensure_login():
    global logged_in
    if not logged_in:
        try:
            await hdrezka_http.login_global("egorsanko@bk.ru", "Yachmen007")
            logged_in = True
            print(f"Login successful! HOST={Request.HOST}")
        except Exception as e:
            print(f"Login failed: {e}")

@app.get("/api/search")
async def search(q: str, year: str = None, type: str = None, season: str = None, episode: str = None, index: int = 0, translator_id: int = None):
    await ensure_login()
    cache_key = (q, year, type, season, episode, index, translator_id)
    _hit = _search_cache.get(cache_key)
    if _hit and _time.monotonic() - _hit[0] < _SEARCH_CACHE_TTL:
        return _hit[1]
    _flight = _inflight.get(cache_key)
    if _flight is not None:
        return await _flight
    _flight = _asyncio.ensure_future(
        _resolve_search(q, year, type, season, episode, index, translator_id, cache_key)
    )
    _inflight[cache_key] = _flight
    try:
        return await _flight
    finally:
        _inflight.pop(cache_key, None)


async def _resolve_search(q, year, type, season, episode, index, translator_id, cache_key):
    try:
        results = await Search(q).get_page(1)
        if not results:
            return {"error": "Not found", "results": []}

        import re as _re
        best = None
        s_num = int(season or 1)

        # Filter by type (movie vs series)
        filtered = results
        if type:
            type_filtered = []
            for r in results:
                url = str(getattr(r, 'url', ''))
                info = str(getattr(r, 'info', '') or '')
                if type in ('tv', 'series'):
                    if '/series/' in url or '/animation/' in url or 'сезон' in info.lower() or 'серия' in info.lower():
                        type_filtered.append(r)
                elif type == 'movie':
                    if '/films/' in url or ('/series/' not in url and '/animation/' not in url and 'сезон' not in info.lower()):
                        type_filtered.append(r)
            if type_filtered:
                filtered = type_filtered

        # For split-season anime/series [ТВ-1], [ТВ-2] etc — match FIRST
        if s_num >= 1:
            for tag in [f"[ТВ-{s_num}]", f"[Сезон {s_num}]", f"ТВ-{s_num}", f"{s_num} сезон"]:
                for r in filtered:
                    if tag in str(getattr(r, 'name', '')):
                        best = r
                        break
                if best:
                    break

        # Year matching with title-normalized fallback. Allow a ±1 year
        # slack because TMDB and HDRezka disagree on release year for late
        # releases / festival-vs-theatrical premieres ("Нормал 2026" on TMDB
        # is "Нормал 2025" on HDRezka), but only when the title actually
        # matches — preventing cross-movie collisions like "Нормал" →
        # "Нормальный 2009" that we used to silently fall into.
        def _norm_title(s):
            return _re.sub(r"[^a-z0-9а-я]", "", (s or "").lower())
        if not best and year:
            try:
                want_year = int(year)
            except (TypeError, ValueError):
                want_year = None
            q_norm = _norm_title(q)
            # Pass 1 — exact year match, then prefer the closest TITLE among
            # same-year candidates. Without the title tiebreak "Мадагаскар"
            # (2005) lost to "Пингвины из Мадагаскара в рождественских
            # приключениях" (2005) just because the short was listed first.
            year_cands = []
            for r in filtered:
                info = getattr(r, 'info', None)
                info_year = getattr(info, 'year', None) if info else None
                if (info_year and str(info_year) == year) \
                        or year in str(info or '') or year in str(getattr(r, 'url', '')):
                    year_cands.append(r)
            if year_cands:
                def _title_score(r):
                    nt = _norm_title(getattr(r, 'name', ''))
                    if nt == q_norm: return 0       # exact title
                    if nt.startswith(q_norm): return 1
                    if q_norm in nt: return 2
                    return 3
                best = min(year_cands, key=_title_score)
            # Pass 2 — ±1 year AND title normalizes the same.
            if not best and want_year is not None:
                for r in filtered:
                    name_norm = _norm_title(getattr(r, 'name', ''))
                    if name_norm != q_norm:
                        continue
                    url_str = str(getattr(r, 'url', ''))
                    info_str = str(getattr(r, 'info', '') or '')
                    for cand in (want_year - 1, want_year + 1):
                        if str(cand) in url_str or str(cand) in info_str:
                            best = r
                            break
                    if best:
                        break

        # Year-mismatch guard: still no match → Not found rather than picking
        # an arbitrary first result with a wrong year.
        if not best and year and index == 0:
            return {"error": "Not found", "results": []}
        if not best:
            if index < len(filtered):
                best = filtered[index]
            elif index < len(results):
                best = results[index]
            else:
                return {"error": "Not found", "results": []}

        post = best
        player = await post.player

        translators = []
        premium_ids = set()
        # Detect translators that require HDRezka premium — they are marked with
        # the CSS class "b-prem_translator". Free users get a 60-second "buy
        # premium" pre-roll instead of the actual stream when such a translator
        # is selected, so we surface this flag to the frontend (lock icon).
        _post_url = str(post.url)
        _pc = _prem_cache.get(_post_url)
        if _pc and _time.monotonic() - _pc[0] < _PREM_TTL:
            premium_ids = _pc[1]
        else:
            try:
                page_html = (await hdrezka_http.get_response('GET', _post_url)).text
                import re as _r_prem
                m_prem = _r_prem.search(
                    r"<ul[^>]*id=.translators-list.[^>]*>(.+?)</ul>",
                    page_html, _r_prem.S,
                )
                print(f"[prem-probe] url={_post_url} len={len(page_html)} ul_found={bool(m_prem)}")
                if m_prem:
                    li_re = _r_prem.compile(
                        r"<li[^>]*?data-translator_id=[\"\'](\d+)[\"\'][^>]*>"
                    )
                    for li in li_re.finditer(m_prem.group(1)):
                        full = li.group(0)
                        is_p = "b-prem_translator" in full
                        if is_p:
                            premium_ids.add(int(li.group(1)))
                        print(f"[prem-probe]   id={li.group(1)} prem={is_p}")
                print(f"[prem-probe] result premium_ids={premium_ids}")
                # Memoize ONLY a non-empty result. An empty set can mean either
                # "genuinely no premium" OR "mirror served bare HTML this time" —
                # pinning that for 6h would hide locks. So we only lock in a
                # positive detection; empty falls back to the 5-min result cache
                # and re-probes, so a missed premium recovers within minutes.
                if premium_ids:
                    _prem_cache[_post_url] = (_time.monotonic(), premium_ids)
            except Exception as ex_prem:
                print(f"premium probe failed: {ex_prem}")

        try:
            raw_t = []
            for name, tid in player.post.translators.name_id.items():
                raw_t.append({"id": tid, "name": name, "is_premium": tid in premium_ids})
            # Push (18+) AND premium variants down so the DEFAULT selection
            # lands on a free, regular cut — premium dubs serve a 60-sec "buy
            # subscription" pre-roll, so defaulting to one made the player load
            # the stub as "main". Saved per-show preference still overrides this
            # on the frontend, so users who explicitly pick 18+/premium keep it.
            def _is_18(t):
                n = (t.get("name") or "").lower()
                return "(18+)" in n or "18+" in n
            def _demote(t):
                return _is_18(t) or bool(t.get("is_premium"))
            translators = [t for t in raw_t if not _demote(t)] + [t for t in raw_t if _demote(t)]
        except Exception as ex:
            print(f"Translators error: {ex}")

        # Default to first translator so the response always carries an
        # active_translator_id. Without this the client labelled translators[0]
        # as active but the stream HDRezka actually returned could be a
        # different dub — UI lied about the playing voiceover.
        if translator_id is None and translators:
            translator_id = translators[0]["id"]

        s = int(season or 1)
        e = int(episode or 1)
        # If matched a split-season entry [ТВ-N], reset season to 1 inside that entry
        post_name = str(getattr(post, 'name', ''))
        tv_match = _re.search(r'\[ТВ-(\d+)\]', post_name)
        if tv_match and int(tv_match.group(1)) > 1:
            s = 1
        async def try_series(tid):
            return await player.get_stream(s, e, tid)
        async def try_movie(tid):
            return await player.get_stream(tid)
        is_series = isinstance(player, PlayerSeries)
        try_fn = try_series if is_series else try_movie
        stream = None
        last_err = None
        active_translator_id = translator_id
        try:
            stream = await try_fn(translator_id)
        except Exception as ex:
            last_err = ex
        if stream is None:
            for _, tid in list(player.post.translators.name_id.items())[:8]:
                try:
                    stream = await try_fn(tid)
                    active_translator_id = tid
                    break
                except Exception as ex:
                    last_err = ex
        # Fallback: parse streams from page HTML if AJAX fails
        if stream is None:
            try:
                page_resp = await hdrezka_http.get_response('GET', str(post.url))
                page_html = page_resp.text
                # Extract streams directly from "streams":"[360p]https://..." pattern
                streams_match = _re.search(r'"streams"\s*:\s*"((?:\[\d+p?\]https?:[^"]*)+)"', page_html)
                if streams_match:
                    streams_str = streams_match.group(1).replace("\\/", "/")
                    raw_fallback = _re.findall(r'\[(\d+p)\](https?://[^\[,\s]+)', streams_str)
                    if raw_fallback:
                        streams = {}
                        for q2, u in raw_fallback:
                            qn = int(q2.replace('p', ''))
                            if qn <= 1080:
                                streams[q2] = u.replace("http://", "https://").strip()
                        best_quality = list(streams.keys())[-1] if streams else ""
                        best_url = streams.get(best_quality, "")
                        print(f"OK (HTML fallback): {post.name}")
                        return _cache_store(cache_key, {
                            "title": post.name, "stream": best_url, "quality": best_quality,
                            "streams": streams, "qualities": list(streams.keys()),
                            "translators": translators, "active_translator_id": translator_id,
                            "is_series": is_series, "url": str(post.url),
                        })
            except Exception as fb_err:
                print(f"HTML fallback failed: {fb_err}")
            raise last_err or Exception("No working translator")

        raw = stream.video.raw_data
        streams = {}
        for quality, urls in raw.items():
            q_name_check = str(quality)
            if "ultra" in q_name_check.lower() or int(quality) > 1080:
                continue
            q_name = str(quality)
            u = urls[0] if isinstance(urls, tuple) else str(urls)
            if u.startswith("http"):
                streams[q_name] = u.replace("http://", "https://")

        best_quality = list(streams.keys())[-1] if streams else ""
        best_url = streams.get(best_quality, "")

        print(f"OK: {post.name} ({post.url})")

        return _cache_store(cache_key, {
            "title": post.name,
            "stream": best_url,
            "quality": best_quality,
            "streams": streams,
            "qualities": list(streams.keys()),
            "translators": translators,
            "active_translator_id": active_translator_id,
            "is_series": is_series,
            "url": str(post.url),
        })
    except Exception as e:
        return {"error": str(e), "results": []}

@app.get("/api/translators")
async def get_translators(q: str):
    await ensure_login()
    try:
        results = await Search(q).get_page(1)
        if not results:
            return {"translators": []}
        player = await results[0].player
        tlist = []
        try:
            for name, tid in player.post.translators.name_id.items():
                tlist.append({"id": tid, "name": name})
        except:
            pass
        return {"translators": tlist}
    except Exception as e:
        return {"translators": [], "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
