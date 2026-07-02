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

from hdrezka import Search, Player, Post
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
import re as _re  # module-level (also imported locally in some funcs — harmless)
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

# Reachable mirror(s) for login + content. rhs.to (login_global's default
# redirector) currently 302s to standby-rezka.tv, which is BLOCKED from this host
# (TLS internal error / connect refused) -> login_global dies -> whole site shows
# "нету". We log in DIRECTLY against a reachable mirror: GET it first (sets the
# session cookie the POST needs), POST /ajax/login/, then pin Request.HOST so
# Search/Player use the SAME working mirror. Env override: HDREZKA_MIRRORS.
_HDREZKA_MIRRORS = [m.strip() for m in _os.environ.get(
    "HDREZKA_MIRRORS",
    "https://hdrezka.cm/,https://hdrezka.club/,https://hdrezka.me/,https://hdrezka.ag/"
).split(",") if m.strip()]


async def ensure_login():
    global logged_in
    if logged_in:
        return
    for host in _HDREZKA_MIRRORS:
        try:
            await hdrezka_http.DEFAULT_CLIENT.get(host, timeout=12)  # GET -> session cookie
            await hdrezka_http.DEFAULT_CLIENT.post(
                host + "ajax/login/",
                data={"login_name": "egorsanko@bk.ru", "login_password": "Yachmen007",
                      "login_not_save": "0", "login": "submit"},
                timeout=12,
            )
            Request.HOST = host
            logged_in = True
            print(f"Login OK via {host}")
            return
        except Exception as e:
            print(f"login {host} failed: {str(e)[:80]}")
    # Last resort: the lib's redirector flow (helps if a blocked mirror returns).
    try:
        await hdrezka_http.login_global("egorsanko@bk.ru", "Yachmen007")
        logged_in = True
        print(f"Login via login_global, HOST={Request.HOST}")
    except Exception as e:
        print(f"all login paths failed: {str(e)[:80]}")

async def _resolve_with_retry(q, year, type, season, episode, index, translator_id, cache_key):
    # A transient HDRezka blip (timeout / mirror hiccup / expired session) comes
    # back as an error that ISN'T a genuine "Not found". Re-login once and retry
    # so the user gets the movie WITHOUT having to reload the page (reported:
    # "иногда фильмы не отдаются, приходится перезагружать, и то не с первого раза").
    # The client waits patiently (no fetch timeout) and only shows "Series not
    # found" after we give up, so bound EACH attempt (an httpx ReadTimeout could
    # otherwise hang the whole 25s) and retry a few times, re-logging in between,
    # instead of dying on the first slow upstream read. On success attempt 1
    # returns in ~1-3s (no added latency); only the rare transient blip pays the
    # retries. Reported: it played for the owner (already cached) but not for
    # another viewer who hit a transient timeout.
    global logged_in
    last = None
    for _attempt in range(3):
        try:
            res = await _asyncio.wait_for(
                _resolve_search(q, year, type, season, episode, index, translator_id, cache_key),
                timeout=12,
            )
        except Exception as e:
            res = {"error": "timeout" if isinstance(e, _asyncio.TimeoutError) else str(e)[:80]}
        last = res
        # Success OR a genuine "Not found" -> done; retrying would not help.
        if isinstance(res, dict) and (res.get("stream") or res.get("error") == "Not found"):
            return res
        # Transient error (timeout / blip / stale session) -> re-login and retry.
        logged_in = False
        try:
            await ensure_login()
        except Exception:
            pass
    return last


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


# Legal takedowns — block HDRezka titles by URL slug (mirror host varies; the
# numeric id + slug are stable). Mirrors lib/blocked-content.ts BLOCKED_HD_SLUGS.
_BLOCKED_HD_SLUGS = [
    "kodeks-dante-2025",  # 2026-06-25 Beget claim (ООО Исола Динамикс / РВВ Филм)
    "eto-hit-2026",       # 2026-06-30 Beget claim (ООО Исола Динамикс / Экспонента Фильм) - Power Ballad
]

def _is_blocked_hd(url) -> bool:
    u = str(url or "").lower()
    return any(s in u for s in _BLOCKED_HD_SLUGS)


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
        results = []
        for _pg in (1, 2):
            try:
                page_res = await Search(q).get_page(_pg)
            except Exception:
                page_res = None
            if not page_res:
                break
            results.extend(page_res)
            if len(results) >= 60:
                break
        out = []
        for r in results[:60]:
            url = str(getattr(r, 'url', '') or '')
            if _is_blocked_hd(url):
                continue
            info = getattr(r, 'info', None)
            year = getattr(info, 'year', None) if info else None
            info_l = str(info or '').lower()
            is_series = ('/series/' in url) or ('сезон' in info_l) or ('серия' in info_l)
            out.append({
                "name": str(getattr(r, 'name', '') or ''),
                "year": year,
                "type": "tv" if is_series else "movie",
                "url": url,
                "poster": getattr(r, 'poster', None),
            })
        resp = {"results": out}
        if out:
            _search_cache[cache_key] = (_time.monotonic(), resp)
        return resp
    except Exception as e:
        return {"results": [], "error": str(e)}


async def _resolve_post(player, name, url, season, episode, translator_id, cache_key):
    # Build the stream response from an already-resolved PlayerMovie/PlayerSeries.
    # Mirrors the tail of _resolve_search; shared by /search (via best.player) and
    # /resolve (via Player(url)). NOTE: keep in sync with _resolve_search until that
    # one is refactored to call this too.
    import re as _re
    translators = []
    premium_ids = set()
    try:
        raw_t = []
        for tname, tid in player.post.translators.name_id.items():
            raw_t.append({"id": tid, "name": tname, "is_premium": tid in premium_ids})
        def _is_18(t):
            n = (t.get("name") or "").lower()
            return "(18+)" in n or "18+" in n
        def _demote(t):
            return _is_18(t) or bool(t.get("is_premium"))
        translators = [t for t in raw_t if not _demote(t)] + [t for t in raw_t if _demote(t)]
    except Exception as ex:
        print(f"Translators error: {ex}")
    if translator_id is None and translators:
        translator_id = translators[0]["id"]
    s = int(season or 1)
    e = int(episode or 1)
    tv_match = _re.search(r'\[ТВ-(\d+)\]', str(name or ''))
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
    if stream is None:
        try:
            page_resp = await hdrezka_http.get_response('GET', url)
            page_html = page_resp.text
            streams_match = _re.search(r'"streams"\s*:\s*"((?:\[\d+p?\]https?:[^"]*)+)"', page_html)
            if streams_match:
                streams_str = streams_match.group(1).replace("\\/", "/")
                raw_fallback = _re.findall(r'\[(\d+p)\](https?://[^\[,\s]+)', streams_str)
                if raw_fallback:
                    streams = {}
                    for q2, u in raw_fallback:
                        streams[q2] = u.replace("http://", "https://").strip()
                    best_quality = list(streams.keys())[-1] if streams else ""
                    best_url = streams.get(best_quality, "")
                    return _cache_store(cache_key, {
                        "title": name, "stream": best_url, "quality": best_quality,
                        "streams": streams, "qualities": list(streams.keys()),
                        "translators": translators, "active_translator_id": translator_id,
                        "is_series": is_series, "url": url,
                    })
        except Exception as fb_err:
            print(f"HTML fallback failed: {fb_err}")
        raise last_err or Exception("No working translator")
    raw = stream.video.raw_data
    streams = {}
    def _relabel(q):
        s2 = str(q).strip().lower()
        if s2 in ("4k", "4к"): return "2160p (4K)"
        if s2 in ("2k", "2к"): return "1440p (2K)"
        return str(q)
    for quality, urls in raw.items():
        q_name = _relabel(quality)
        u = urls[0] if isinstance(urls, tuple) else str(urls)
        if u.startswith("http"):
            streams[q_name] = u.replace("http://", "https://")
    def _qnum(q):
        s2 = str(q).lower()
        m = _re.search(r"(\d{3,4})", s2)
        n = int(m.group(1)) if m else 0
        if "ultra" in s2:
            n += 1
        return n
    ordered = sorted(streams.keys(), key=_qnum)
    streams = {k: streams[k] for k in ordered}
    le1080 = [q for q in ordered if _qnum(q) <= 1080]
    best_quality = le1080[-1] if le1080 else (ordered[0] if ordered else "")
    best_url = streams.get(best_quality, "")
    return _cache_store(cache_key, {
        "title": name,
        "stream": best_url,
        "quality": best_quality,
        "streams": streams,
        "qualities": list(streams.keys()),
        "translators": translators,
        "active_translator_id": active_translator_id,
        "is_series": is_series,
        "url": url,
    })


@app.get("/api/resolve")
async def resolve_by_url(url: str, season: str = None, episode: str = None, translator_id: int = None):
    # Resolve a stream DIRECTLY by HDRezka post URL (no title search) — for the
    # HDRezka-native pages (titles with no TMDB match).
    if _is_blocked_hd(url):
        return {"error": "Not found", "results": []}
    await ensure_login()
    cache_key = ("resolve", url, season, episode, translator_id)
    _hit = _search_cache.get(cache_key)
    if _hit and _time.monotonic() - _hit[0] < _SEARCH_CACHE_TTL:
        return _hit[1]
    try:
        player = await Player(url)
        name = str(getattr(player.post, 'name', '') or '')
        return await _resolve_post(player, name, url, season, episode, translator_id, cache_key)
    except Exception as e:
        return {"error": str(e)}


_details_cache: dict = {}

@app.get("/api/details")
async def details(url: str):
    # HDRezka title card (poster/desc/year/genres + seasons) by URL — for the
    # HDRezka-native detail page. Cached longer than streams (metadata is stable).
    _hit = _details_cache.get(url)
    if _hit and _time.monotonic() - _hit[0] < 6 * 3600:
        return _hit[1]
    await ensure_login()
    try:
        player = await Player(url)
        info = player.post.info
        is_series = isinstance(player, PlayerSeries)
        pst = getattr(info, 'poster', None)
        poster = (getattr(pst, 'full', None) or getattr(pst, 'preview', None)) if pst else None
        rel = getattr(info, 'release', None)
        year = getattr(rel, 'year', None) if rel else None
        def _names(seq):
            out = []
            for x in (seq or ()):
                n = getattr(x, 'name', None)
                out.append(str(n if n is not None else x))
            return out
        # Hyperlink(name,url) list → [{name,url}]  (genres/collections/countries)
        def _links(seq):
            out = []
            for x in (seq or ()):
                out.append({"name": str(getattr(x, 'name', '') or ''), "url": str(getattr(x, 'url', '') or '')})
            return out
        # Person(name,url,image,...) list → [{name,url,image}]
        def _persons(seq):
            out = []
            for x in (seq or ()):
                out.append({
                    "name": str(getattr(x, 'name', '') or ''),
                    "url": str(getattr(x, 'url', '') or ''),
                    "image": str(getattr(x, 'image', '') or '') or None,
                })
            return out
        # ratings dict → {imdb:{rating,votes,url}, kp:{...}, hdrezka:{...}} + imdb_id
        ratings_out = {}
        imdb_id = None
        try:
            for key in ("imdb", "kp", "hdrezka"):
                r = (getattr(info, 'ratings', {}) or {}).get(key)
                if not r:
                    continue
                svc = getattr(r, 'service', None)
                rurl = str(getattr(svc, 'url', '') or '')
                ratings_out[key] = {"rating": getattr(r, 'rating', 0) or 0, "votes": getattr(r, 'votes', 0) or 0, "url": rurl}
                if key == "imdb":
                    m = _re.search(r'title/(tt\d+)', rurl)
                    if m:
                        imdb_id = m.group(1)
        except Exception:
            pass
        age = None
        try:
            ar = getattr(info, 'age_rating', None)
            if ar is not None:
                age = {"age": getattr(ar, 'age', None), "description": str(getattr(ar, 'description', '') or '')}
        except Exception:
            pass
        rankings_out = []
        try:
            for rk in (getattr(info, 'rankings', None) or ()):
                nm = getattr(rk, 'name', None)
                rankings_out.append({"name": str(getattr(nm, 'name', '') or nm or ''), "url": str(getattr(nm, 'url', '') or ''), "rank": getattr(rk, 'rank', None)})
        except Exception:
            pass
        franchise_url = None
        try:
            fr = getattr(player.post, 'franchises', None)
            franchise_url = str(getattr(fr, 'url', '') or '') or None
        except Exception:
            pass
        resp = {
            "title": str(getattr(info, 'title', '') or getattr(player.post, 'name', '') or ''),
            "orig_title": str(getattr(info, 'orig_title', '') or ''),
            "year": year,
            "poster": poster,
            "description": str(getattr(info, 'description', '') or ''),
            "type": "tv" if is_series else "movie",
            "url": url,
            "hdrezka_id": getattr(player.post, 'id', None),
            "genres": _names(getattr(info, 'genre', None))[:6],
            "genre_links": _links(getattr(info, 'genre', None))[:6],
            "countries": _names(getattr(info, 'country', None))[:3],
            "duration": str(getattr(info, 'duration', '') or ''),
            "ratings": ratings_out,
            "imdb_id": imdb_id,
            "age": age,
            "persons": _persons(getattr(info, 'persons', None))[:20],
            "directors": _persons(getattr(info, 'directors', None))[:5],
            "collections": _links(getattr(info, 'collections', None))[:12],
            "rankings": rankings_out[:8],
            "franchise_url": franchise_url,
            "quality": str(getattr(info, 'quality', '') or ''),
        }
        if is_series:
            try:
                eps = await player.get_episodes()
                resp["seasons"] = {str(k): [int(n) for n in v] for k, v in eps.items()}
            except Exception:
                resp["seasons"] = {}
        _details_cache[url] = (_time.monotonic(), resp)
        return resp
    except Exception as e:
        return {"error": str(e)}


_browse_cache: dict = {}
_trailer_cache: dict = {}

def _parse_catalog(html):
    """Parse an HDRezka catalog/showcase page into card dicts. Tolerant to markup
    drift: split on the card class, pull data-url/id/poster/title/year per chunk."""
    items = []
    for p in html.split('class="b-content__inline_item"')[1:]:
        urlm = _re.search(r'data-url="([^"]+)"', p)
        if not urlm:
            continue
        curl = urlm.group(1)
        idm = _re.search(r'data-id="(\d+)"', p)
        pm = _re.search(r'<img[^>]+src="([^"]+)"', p)
        tm = _re.search(r'b-content__inline_item-link">\s*<a[^>]*>([^<]+)</a>', p)
        if not tm:
            tm = _re.search(r'<a href="[^"]*"[^>]*>([^<]+)</a>', p)
        ym = _re.search(r'<div>[^<]*?(\d{4})', p)
        items.append({
            "id": int(idm.group(1)) if idm else None,
            "url": curl,
            "poster": pm.group(1) if pm else None,
            "title": tm.group(1).strip() if tm else None,
            "year": ym.group(1) if ym else None,
            "type": "tv" if "/series/" in curl else "movie",
        })
        if len(items) >= 60:
            break
    return items

@app.get("/api/browse")
async def browse(cat: str = "films", sort: str = "last", genre: str = None, year: str = None, page: int = 1):
    """Showcase/catalog feed for the HDRezka-native homepage & genre browse.
    cat=films|series|cartoons|animation|new ; sort=last|popular|watching|soon|best."""
    await ensure_login()
    if cat not in ("films", "series", "cartoons", "animation", "new"):
        cat = "films"
    key = ("browse", cat, sort, genre, year, page)
    hit = _browse_cache.get(key)
    if hit and _time.monotonic() - hit[0] < 600:
        return hit[1]
    base = Request.HOST.rstrip("/") + "/"
    if cat == "new":
        path = "new/"
    elif sort == "best":
        path = f"{cat}/best/" + (f"{genre}/" if genre else "") + (f"{year}/" if year else "")
    elif genre:
        path = f"{cat}/{genre}/"
    else:
        path = f"{cat}/"
    if page and int(page) > 1:
        path += f"page/{int(page)}/"
    qs = f"?filter={sort}" if (sort in ("popular", "watching", "soon") and cat != "new") else ""
    url = base + path + qs
    try:
        r = await hdrezka_http.DEFAULT_CLIENT.get(url, timeout=15)
        resp = {"items": _parse_catalog(r.text), "page": int(page), "source_url": url}
        _browse_cache[key] = (_time.monotonic(), resp)
        return resp
    except Exception as e:
        return {"items": [], "error": str(e)[:120]}

@app.get("/api/trailer")
async def trailer(id: int = None, url: str = None):
    """YouTube trailer id for a title. Prefer numeric HDRezka id (fast, no resolve);
    fall back to resolving the url. HDRezka returns an <iframe youtube.com/embed/ID>."""
    await ensure_login()
    key = ("trailer", id, url)
    hit = _trailer_cache.get(key)
    if hit and _time.monotonic() - hit[0] < 6 * 3600:
        return hit[1]
    pid = id
    try:
        if not pid and url:
            player = await Player(url)
            pid = getattr(player.post, 'id', None)
        if not pid:
            return {"youtube_id": None}
        r = await hdrezka_http.DEFAULT_CLIENT.post(
            Request.HOST.rstrip("/") + "/engine/ajax/gettrailervideo.php",
            data={"id": pid}, timeout=12)
        code = (r.json() or {}).get("code", "") or ""
        m = _re.search(r'youtube\.com/embed/([A-Za-z0-9_-]{6,})', code)
        resp = {"youtube_id": m.group(1) if m else None}
        _trailer_cache[key] = (_time.monotonic(), resp)
        return resp
    except Exception as e:
        return {"youtube_id": None, "error": str(e)[:120]}


_episodes_cache: dict = {}

@app.get("/api/episodes")
async def episodes(url: str, translator_id: int = None):
    # Per-translator season/episode tree (HDRezka-style). Pick a translator and
    # get exactly the seasons/episodes IT has — so the UI can scope its season/
    # episode selectors to the chosen dub and never offer an invalid combo.
    #   GET /api/episodes?url=...&translator_id=110   ->
    #     {"type":"tv","translator_id":110,
    #      "translators":[{"id":56,"name":"Дубляж"},...],
    #      "seasons":{"21":[1123,...],"22":[...]}}
    ck = (url, translator_id)
    _hit = _episodes_cache.get(ck)
    if _hit and _time.monotonic() - _hit[0] < 3 * 3600:
        return _hit[1]
    await ensure_login()
    try:
        player = await Player(url)
        if not isinstance(player, PlayerSeries):
            resp = {"type": "movie", "translators": [], "seasons": {}}
            _episodes_cache[ck] = (_time.monotonic(), resp)
            return resp
        translators = []
        try:
            for tname, tid in player.post.translators.name_id.items():
                translators.append({"id": int(tid), "name": str(tname)})
        except Exception:
            pass
        eps = await player.get_episodes(translator_id)
        resp = {
            "type": "tv",
            "translator_id": int(translator_id) if translator_id is not None
                else (translators[0]["id"] if translators else None),
            "translators": translators,
            "seasons": {str(k): [int(n) for n in v] for k, v in eps.items()},
        }
        _episodes_cache[ck] = (_time.monotonic(), resp)
        return resp
    except Exception as e:
        return {"error": str(e)}


_eptr_cache: dict = {}

@app.get("/api/episode-translators")
async def episode_translators(url: str, season: int = None, episode: int = None):
    # Which dubs actually have THIS (season, episode). For the in-player dub
    # switcher: only offer voiceovers that translated the episode being watched,
    # so the user can't pick a dub that lacks the current episode.
    #   GET /api/episode-translators?url=...&season=4&episode=7 -> {"ids":[56,101]}
    ck = (url, season, episode)
    _hit = _eptr_cache.get(ck)
    if _hit and _time.monotonic() - _hit[0] < 3 * 3600:
        return _hit[1]
    await ensure_login()
    try:
        player = await Player(url)
        if not isinstance(player, PlayerSeries) or season is None or episode is None:
            resp = {"ids": []}
            _eptr_cache[ck] = (_time.monotonic(), resp)
            return resp
        s, e = int(season), int(episode)
        ids = []
        for _tname, tid in player.post.translators.name_id.items():
            try:
                tree = await player.get_episodes(tid)
                if s in tree and e in tuple(tree[s]):
                    ids.append(int(tid))
            except Exception:
                pass
        resp = {"ids": ids}
        _eptr_cache[ck] = (_time.monotonic(), resp)
        return resp
    except Exception as ex:
        return {"error": str(ex)}


import difflib as _difflib


def _title_related(qn, nmn):
    """True if a normalized query relates to a normalized candidate title:
    substring either way, OR high fuzzy similarity. Lets sequel-number /
    punctuation diffs through ("трансформеры4эпохаистребления" vs HDRezka's
    "трансформерыэпохаистребления" -> the lone "4" breaks plain substring) while
    still rejecting genuine collisions (English "thismorning" vs a Russian-titled
    anime/drama)."""
    if not qn or not nmn:
        return False
    if qn in nmn or nmn in qn:
        return True
    return _difflib.SequenceMatcher(None, qn, nmn).ratio() >= 0.6


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
                    # Cartoon SERIES (Rick and Morty, etc.) live under /cartoons/
                    # and anime series under /animation/ — keep both, plus /series/
                    # and anything whose info mentions seasons/episodes. Otherwise a
                    # TMDB "tv" request finds nothing for cartoons (the page exists
                    # but was filtered out as a "movie").
                    if ('/series/' in url or '/animation/' in url or '/cartoons/' in url
                            or 'сезон' in info.lower() or 'серия' in info.lower()):
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
            # Relevance guard: the [ТВ-N] / season tag alone is NOT enough — require the
            # candidate title to actually relate to the query, else an unrelated
            # anime whose HDRezka name happens to carry "[ТВ-1]" hijacks the
            # resolve (e.g. original-name fallback "This Morning" -> KonoSuba
            # "Богиня благословляет этот прекрасный мир [ТВ-1]"). For real split-season hits
            # the query (ru or original name) is contained in the candidate name.
            _qn = _re.sub(r"[^a-z0-9а-я]", "", (q or "").lower())
            for tag in [f"[ТВ-{s_num}]", f"[Сезон {s_num}]", f"ТВ-{s_num}", f"{s_num} сезон"]:
                for r in filtered:
                    nm = str(getattr(r, 'name', ''))
                    if tag not in nm:
                        continue
                    nmn = _re.sub(r"[^a-z0-9а-я]", "", nm.lower())
                    if _qn and not _title_related(_qn, nmn):
                        continue
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
                _cand = min(year_cands, key=_title_score)
                # Require SOME title relationship (substring or high fuzzy match)
                # so a pure YEAR match with an unrelated title can't hijack the
                # resolve ("This Morning" 1988 -> "Это - Англия. Год 1988"),
                # while STILL allowing sequel-number / punctuation diffs
                # ("Трансформеры 4: Эпоха истребления" -> HDRezka "Трансформеры:
                # Эпоха истребления", lone "4" breaks plain substring).
                if _title_related(q_norm, _norm_title(getattr(_cand, "name", ""))):
                    best = _cand
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
        if _is_blocked_hd(getattr(post, 'url', '')):
            return {"error": "Not found", "results": []}
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
