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

        # Filter by year if no split-season match
        if not best and year:
            for r in filtered:
                info = getattr(r, 'info', None)
                info_year = getattr(info, 'year', None) if info else None
                if info_year and str(info_year) == year:
                    best = r
                    break
                elif year in str(info or '') or year in str(getattr(r, 'url', '')):
                    best = r
                    break

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
        try:
            for name, tid in player.post.translators.name_id.items():
                translators.append({"id": tid, "name": name})
        except Exception as ex:
            print(f"Translators error: {ex}")

        s = int(season or 1)
        e = int(episode or 1)
        # If matched a split-season entry [ТВ-N], reset season to 1 inside that entry
        post_name = str(getattr(post, 'name', ''))
        import re as _re
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
        try:
            stream = await try_fn(translator_id)
        except Exception as ex:
            last_err = ex
        if stream is None:
            for _, tid in list(player.post.translators.name_id.items())[:8]:
                try:
                    stream = await try_fn(tid)
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
                        for q, u in raw_fallback:
                            qn = int(q.replace('p',''))
                            if qn <= 1080:
                                streams[q] = u.replace("http://", "https://").strip()
                        best_quality = list(streams.keys())[-1] if streams else ""
                        best_url = streams.get(best_quality, "")
                        print(f"OK (HTML fallback): {post.name}")
                        return {
                            "title": post.name, "stream": best_url, "quality": best_quality,
                            "streams": streams, "qualities": list(streams.keys()),
                            "translators": translators, "is_series": is_series, "url": str(post.url),
                        }
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

        return {
            "title": post.name,
            "stream": best_url,
            "quality": best_quality,
            "streams": streams,
            "qualities": list(streams.keys()),
            "translators": translators,
            "is_series": is_series,
            "url": str(post.url),
        }
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
