from fastapi import FastAPI, Response
from fastapi import Request as HTTPRequest  # aliased — `Request` is later shadowed by hdrezka.url.Request
from fastapi.responses import StreamingResponse
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

# ── Mail relay ────────────────────────────────────────────────────────────────
# The web-VPS (Next app) can't egress SMTP — its host blocks 25/465/587. THIS box
# (LeadSeek) can reach smtp.beget.com:465, so the Next auth route renders the
# verification / reset email and POSTs it here to be relayed via Beget. Secret-
# gated: the endpoint is reachable through the public /hdrezka/ proxy, so without
# the shared secret it can't be abused to send mail as noreply@sapkeflykino.ru.
# SMTP creds + secret live in /root/movie/.mailenv (NOT in git), loaded here.
import os as _os, smtplib as _smtplib, ssl as _ssl2
from email.message import EmailMessage as _EmailMessage
from pydantic import BaseModel as _BaseModel

def _load_mailenv(path="/root/movie/.mailenv"):
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                _os.environ.setdefault(k.strip(), v.strip())
    except FileNotFoundError:
        pass
_load_mailenv()

class _SendMailReq(_BaseModel):
    to: str
    subject: str
    text: str = ""
    html: str = ""
    secret: str = ""

@app.post("/api/send-mail")
async def send_mail(req: _SendMailReq):
    secret = _os.environ.get("MAIL_SECRET", "")
    if not secret or req.secret != secret:
        return {"error": "forbidden"}
    user = _os.environ.get("SMTP_USER", "")
    pw = _os.environ.get("SMTP_PASS", "")
    if not (user and pw):
        return {"error": "smtp not configured"}
    host = _os.environ.get("SMTP_HOST", "smtp.beget.com")
    port = int(_os.environ.get("SMTP_PORT", "465"))
    frm = _os.environ.get("MAIL_FROM", "sapkeflykino <noreply@sapkeflykino.ru>")
    msg = _EmailMessage()
    msg["From"] = frm
    msg["To"] = req.to
    msg["Subject"] = req.subject
    msg.set_content(req.text or " ")
    if req.html:
        msg.add_alternative(req.html, subtype="html")
    try:
        ctx = _ssl2.create_default_context()
        with _smtplib.SMTP_SSL(host, port, context=ctx, timeout=20) as s:
            s.login(user, pw)
            s.send_message(msg)
        return {"ok": True}
    except Exception as e:
        return {"error": str(e)}

# ── HLS proxy ─────────────────────────────────────────────────────────────────
# HDRezka's CDN throttles some quality tiers down to ~0 on a given viewer's
# network ROUTE to the assigned edge (it 302s each request to e.g.
# phantom.laptostack.org). THIS box (LeadSeek) has a fast route to those edges
# (measured 5.9 MB/s on a segment that hangs elsewhere), so for a throttled tier
# the player streams through here instead of direct: we rewrite the HLS manifest
# so every segment / sub-playlist / key flows back through this proxy. Only used
# for tiers the client probe found throttled — normal viewing stays direct.
import base64 as _b64

_HLS_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Referer": "https://hdrezka.ag/",
}
_PROXY_BASE = _os.environ.get("HLS_PROXY_BASE", "https://kino.lead-seek.ru/hdrezka")

def _dec_u(u: str) -> str:
    s = u.replace("-", "+").replace("_", "/")
    s += "=" * (-len(s) % 4)
    return _b64.b64decode(s).decode("utf-8")

def _enc_u(url: str) -> str:
    return _b64.urlsafe_b64encode(url.encode()).decode().rstrip("=")

def _resolve(base: str, ref: str) -> str:
    # HDRezka segment names contain ':' (file.mp4:hls:seg.ts), which urljoin
    # mistakes for a scheme — so resolve relatives by hand against the dir.
    if ref.startswith("http://") or ref.startswith("https://"):
        return ref
    return base[: base.rfind("/") + 1] + ref

import re as _re_hls
def _rewrite_uri_attr(line: str, base: str) -> str:
    def _repl(m):
        abs_ = _resolve(base, m.group(1))
        ep = "/api/hls.m3u8?u=" if ".m3u8" in m.group(1) else "/api/hls/seg?u="
        return 'URI="' + _PROXY_BASE + ep + _enc_u(abs_) + '"'
    return _re_hls.sub(r'URI="([^"]+)"', _repl, line)

# NOTE: path ends in .m3u8 ON PURPOSE — ArtPlayer picks the HLS (hls.js) handler
# by URL extension, so the proxied manifest must look like a .m3u8 or it falls
# through to a plain <video src> and the segments never get proxied.
@app.get("/api/hls.m3u8")
async def hls_manifest(u: str):
    try:
        url = _dec_u(u)
    except Exception:
        return Response("bad u", status_code=400)
    try:
        r = await hdrezka_http.DEFAULT_CLIENT.get(url, headers=_HLS_HEADERS, follow_redirects=True)
        base = str(r.url)
        out = []
        for line in r.text.splitlines():
            s = line.strip()
            if not s:
                out.append(line)
            elif s.startswith("#"):
                out.append(_rewrite_uri_attr(s, base) if 'URI="' in s else s)
            else:
                abs_ = _resolve(base, s)
                ep = "/api/hls.m3u8?u=" if ".m3u8" in s else "/api/hls/seg?u="
                out.append(_PROXY_BASE + ep + _enc_u(abs_))
        return Response("\n".join(out) + "\n", media_type="application/vnd.apple.mpegurl",
                        headers={"Cache-Control": "no-store"})
    except Exception as e:
        return Response("err: " + str(e), status_code=502)

@app.get("/api/hls/seg")
async def hls_seg(u: str, request: HTTPRequest):
    try:
        url = _dec_u(u)
    except Exception:
        return Response("bad u", status_code=400)
    try:
        headers = dict(_HLS_HEADERS)
        # Forward the client's Range header — iOS Safari plays HLS natively and
        # SEEKS via byte-range requests; without passing Range through, seeking on
        # iPhone froze. Honour the upstream 206 + range headers in the reply.
        rng = request.headers.get("range")
        if rng:
            headers["Range"] = rng
        req = hdrezka_http.DEFAULT_CLIENT.build_request("GET", url, headers=headers)
        r = await hdrezka_http.DEFAULT_CLIENT.send(req, stream=True, follow_redirects=True)
        ct = r.headers.get("content-type", "video/mp2t")
        out_headers = {"Cache-Control": "no-store", "Accept-Ranges": "bytes"}
        for h in ("content-range", "content-length"):
            if h in r.headers:
                out_headers[h.title()] = r.headers[h]
        async def gen():
            try:
                async for chunk in r.aiter_bytes():
                    yield chunk
            finally:
                await r.aclose()
        return StreamingResponse(gen(), status_code=r.status_code, media_type=ct, headers=out_headers)
    except Exception as e:
        return Response("err: " + str(e), status_code=502)


# ── TMDB proxy for the Android TV app ─────────────────────────────────────────
# RU consumer ISPs throttle/block api.themoviedb.org + image.tmdb.org, so the TV
# app routes ALL TMDB traffic through here (this server reaches TMDB fine). The
# web site proxies TMDB for the same reason.
_TMDB_KEY = "275c9d09780aadb4b13ff57a731eda00"

@app.get("/api/tmdb")
async def tmdb_proxy(request: HTTPRequest):
    params = dict(request.query_params)
    path = params.pop("path", "")
    if not path.startswith("/"):
        return Response('{"error":"bad path"}', status_code=400, media_type="application/json")
    params["api_key"] = _TMDB_KEY
    params.setdefault("language", "ru-RU")
    try:
        r = await hdrezka_http.DEFAULT_CLIENT.get(
            "https://api.themoviedb.org/3" + path, params=params, timeout=15)
        return Response(r.content, status_code=r.status_code, media_type="application/json",
                        headers={"Cache-Control": "public, max-age=600"})
    except Exception as e:
        return Response('{"error":"%s"}' % str(e)[:80], status_code=502, media_type="application/json")

@app.get("/api/img")
async def tmdb_img(p: str):
    if not p.startswith("/t/p/"):
        return Response("bad", status_code=400)
    try:
        r = await hdrezka_http.DEFAULT_CLIENT.get("https://image.tmdb.org" + p, timeout=20)
        return Response(r.content, status_code=r.status_code,
                        media_type=r.headers.get("content-type", "image/jpeg"),
                        headers={"Cache-Control": "public, max-age=604800"})
    except Exception:
        return Response(b"", status_code=502)

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

async def _resolve_with_retry(q, year, type, season, episode, index, translator_id, cache_key):
    # A transient HDRezka blip (timeout / mirror hiccup / expired session) comes
    # back as an error that ISN'T a genuine "Not found". Re-login once and retry
    # so the user gets the movie WITHOUT having to reload the page (reported:
    # "иногда фильмы не отдаются, приходится перезагружать, и то не с первого раза").
    res = await _resolve_search(q, year, type, season, episode, index, translator_id, cache_key)
    if isinstance(res, dict) and res.get("error") and res.get("error") != "Not found":
        global logged_in
        logged_in = False
        await ensure_login()
        res2 = await _resolve_search(q, year, type, season, episode, index, translator_id, cache_key)
        if isinstance(res2, dict) and (res2.get("stream") or res2.get("error") == "Not found"):
            return res2
    return res


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
        _resolve_with_retry(q, year, type, season, episode, index, translator_id, cache_key)
    )
    _inflight[cache_key] = _flight
    try:
        return await _flight
    finally:
        _inflight.pop(cache_key, None)


@app.get("/api/find")
async def find(q: str):
    # Lightweight HDRezka search: returns the result LIST only (NO stream resolve),
    # so the site can show/keep only titles that actually exist on HDRezka. ~300ms
    # vs the ~2-3s full resolve. Used to filter TMDB search results by availability.
    await ensure_login()
    cache_key = ("find", q)
    _hit = _search_cache.get(cache_key)
    if _hit and _time.monotonic() - _hit[0] < _SEARCH_CACHE_TTL:
        return _hit[1]
    try:
        results = await Search(q).get_page(1)
        out = []
        for r in (results or [])[:30]:
            url = str(getattr(r, 'url', '') or '')
            info = getattr(r, 'info', None)
            year = getattr(info, 'year', None) if info else None
            info_l = str(info or '').lower()
            is_series = ('/series/' in url) or ('сезон' in info_l) or ('серия' in info_l)
            out.append({
                "name": str(getattr(r, 'name', '') or ''),
                "year": year,
                "type": "tv" if is_series else "movie",
                "url": url,
            })
        resp = {"results": out}
        if out:
            _search_cache[cache_key] = (_time.monotonic(), resp)
        return resp
    except Exception as e:
        return {"results": [], "error": str(e)}


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
                    # Anime FEATURE FILMS live under /animation/ too (e.g.
                    # "Паприка" 2006), so only exclude clear SERIES — don't
                    # drop /animation/ wholesale or anime movies vanish.
                    if '/series/' not in url and 'сезон' not in info.lower() and 'серия' not in info.lower():
                        type_filtered.append(r)
            if type_filtered:
                filtered = type_filtered

        # For split-season anime/series [ТВ-1], [ТВ-2] etc — match FIRST.
        # ONLY for TV/series requests — for a MOVIE this wrongly grabbed an anime
        # SERIES whose name happened to contain the query + "[ТВ-1]" (e.g. movie
        # "Горничная" 2025 → "Кобаяси и её горничная-дракон [ТВ-1]" 2017).
        if type in ('tv', 'series') and s_num >= 1:
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

            # Pass 3 — an EXACT normalized-title match is a strong enough signal
            # on its own; accept it even when HDRezka's year is missing or
            # disagrees (e.g. "Паприка" 2006 listed without a parseable year).
            # Safe: an exact match can't collide ("Нормал" != "Нормальный").
            if not best:
                exact = [r for r in filtered if _norm_title(getattr(r, 'name', '')) == q_norm]
                if exact:
                    best = exact[0]

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
        # Premium account is PAID — every dub plays and downloads, none are
        # locked. So we no longer probe the post page for "b-prem_translator"
        # / surface lock icons. Bonus: dropping that ~130KB page fetch makes the
        # resolve noticeably faster. premium_ids stays empty → is_premium=False.
        premium_ids = set()

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
                            # expose all qualities incl 2K/4K (premium account)
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
        # HDRezka labels its top tiers "2K"/"4K" (sometimes Cyrillic "2К"/"4К"),
        # which have no sortable number — the player's quality menu sorts by
        # parseInt, so they'd wrongly land at the bottom. Relabel to numeric-
        # leading strings so both the backend ordering and the frontend sort put
        # them at the top, while still showing the friendly 2K/4K tag.
        def _relabel(q):
            s = str(q).strip().lower()
            if s in ("4k", "4к"): return "2160p (4K)"
            if s in ("2k", "2к"): return "1440p (2K)"
            return str(q)
        for quality, urls in raw.items():
            # Premium account → expose EVERY quality incl 2K/4K.
            # The old >1080 cap was a free-tier relic.
            q_name = _relabel(quality)
            u = urls[0] if isinstance(urls, tuple) else str(urls)
            if u.startswith("http"):
                streams[q_name] = u.replace("http://", "https://")

        # Order ascending by real quality. "1080p Ultra" (higher-bitrate 1080)
        # ranks just above plain "1080p"; "1440p (2K)"/"2160p (4K)" above that.
        import re as _re_q
        def _qnum(q):
            s = str(q).lower()
            m = _re_q.search(r"(\d{3,4})", s)
            n = int(m.group(1)) if m else 0
            if "ultra" in s:
                n += 1
            return n
        ordered = sorted(streams.keys(), key=_qnum)
        streams = {k: streams[k] for k in ordered}
        # Default to plain 1080p — higher tiers (1080p Ultra / 2K / 4K) are often
        # throttled by HDRezka's CDN on the viewer's network route (confirmed
        # route-dependent: our server has a fast path to every tier, so it can't
        # tell which are slow for a given user — a server-side probe is useless).
        # 1080p is the most reliable, and the rest stay one tap away in the menu.
        le1080 = [q for q in ordered if _qnum(q) <= 1080]
        best_quality = le1080[-1] if le1080 else (ordered[0] if ordered else "")
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
