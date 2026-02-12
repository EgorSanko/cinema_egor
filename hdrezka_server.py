import os
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
Request.HOST = "http://rezka.ag/"

from hdrezka import Search

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

logged_in = False

async def ensure_login():
    global logged_in
    if not logged_in:
        login = os.environ.get("HDREZKA_LOGIN", "")
        password = os.environ.get("HDREZKA_PASSWORD", "")
        if not login or not password:
            print("Warning: HDREZKA_LOGIN / HDREZKA_PASSWORD not set, skipping login")
            return
        try:
            await hdrezka_http.get_response("POST", "http://rezka.ag/ajax/login/", data={
                "login_name": login,
                "login_password": password,
                "login_not_save": "0",
                "login": "submit"
            })
            logged_in = True
            print("Login successful!")
        except Exception as e:
            print(f"Login failed: {e}")

@app.get("/api/search")
async def search(q: str, year: str = None, type: str = None, season: str = None, episode: str = None, index: int = 0, translator_id: int = None):
    await ensure_login()
    try:
        results = await Search(q).get_page(1)
        if not results:
            return {"error": "Not found", "results": []}

        # Filter by type via URL (/series/ vs /films/)
        if type in ('tv', 'series'):
            filtered = [r for r in results if '/series/' in str(getattr(r, 'url', ''))]
            if filtered:
                results = filtered
        elif type == 'movie':
            filtered = [r for r in results if '/films/' in str(getattr(r, 'url', ''))]
            if filtered:
                results = filtered

        best = None
        if year:
            for r in results:
                info = str(getattr(r, 'info', '') or '')
                if year in info or year in str(getattr(r, 'url', '')):
                    best = r
                    break
        if not best:
            if index < len(results):
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
        try:
            stream = await player.get_stream(s, e, translator_id)
            is_series = True
        except:
            stream = await player.get_stream(translator_id)
            is_series = False

        raw = stream.video.raw_data
        streams = {}
        for quality, urls in raw.items():
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
