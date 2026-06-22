#!/usr/bin/env python3
"""
sapkeflykino Telegram bot (@sapkeflykino_bot).

Two jobs:
  1. Search entry / fallback door — user types a title, the bot searches TMDB and
     replies with a poster card + "▶️ Смотреть" buttons that deep-link to the site
     (/movie/{id} or /tv/{id}). If the domain ever gets RKN-blocked, only SITE_URL
     has to change — Telegram itself isn't blockable, so the bot stays a live door.
  2. Channel auto-poster (optional) — posts fresh releases that actually resolve on
     HDRezka to CHANNEL. Triggered by `--post` (run from cron), not the poller.

No framework — raw long-polling over httpx (already in the kino venv). Config via
env (see sapkefly-bot.service / .env on LeadSeek); token NEVER lives in git.
"""
import os
import sys
import time
import html
import httpx

TOKEN = os.environ.get("BOT_TOKEN", "")
SITE = os.environ.get("SITE_URL", "https://sapkeflykino.ru").rstrip("/")
TMDB = os.environ.get("TMDB_KEY", "275c9d09780aadb4b13ff57a731eda00")
CHANNEL = os.environ.get("CHANNEL", "")  # @username or -100... id, for --post
RESOLVE = os.environ.get("RESOLVE_URL", "https://kino.lead-seek.ru/hdrezka/api/search")

API = f"https://api.telegram.org/bot{TOKEN}"
http = httpx.Client(timeout=40, verify=False, headers={"User-Agent": "sapkefly-bot"})

WELCOME = (
    "🎬 <b>SAPKEFLY KINO</b>\n\n"
    "Фильмы и сериалы бесплатно, без рекламы — в 4K и со всеми озвучками.\n\n"
    "🔍 Напиши название фильма или сериала — найду и дам ссылку «Смотреть»."
)


def tg(method, **params):
    try:
        return http.post(f"{API}/{method}", json=params).json()
    except Exception as e:
        print("tg err", method, e, flush=True)
        return {}


def tmdb_search(q):
    try:
        r = http.get(
            "https://api.themoviedb.org/3/search/multi",
            params={"api_key": TMDB, "language": "ru-RU", "query": q, "include_adult": "false"},
        )
        out = []
        for it in (r.json().get("results") or []):
            mt = it.get("media_type")
            if mt not in ("movie", "tv") or not it.get("poster_path"):
                continue
            date = it.get("release_date") or it.get("first_air_date") or ""
            out.append({
                "id": it["id"], "type": mt,
                "title": it.get("title") or it.get("name") or "",
                "year": date[:4] if date else "",
                "rating": it.get("vote_average") or 0,
                "poster": it.get("poster_path"),
                "overview": it.get("overview") or "",
            })
            if len(out) >= 5:
                break
        return out
    except Exception as e:
        print("tmdb err", e, flush=True)
        return []


def trunc(s, n=850):
    """Trim an overview to fit a Telegram caption WITHOUT chopping mid-word —
    cut at the last sentence end (or space) and add an ellipsis."""
    s = (s or "").strip()
    if len(s) <= n:
        return s
    cut = s[:n]
    for sep in (". ", "! ", "? "):
        i = cut.rfind(sep)
        if i > n * 0.6:
            return cut[: i + 1].strip() + " …"
    i = cut.rfind(" ")
    return (cut[:i] if i > 0 else cut).strip() + " …"


def url_for(it):
    return f"{SITE}/{'movie' if it['type'] == 'movie' else 'tv'}/{it['id']}"


def icon(it):
    return "🎬" if it["type"] == "movie" else "📺"


def handle_message(msg):
    chat_id = msg["chat"]["id"]
    text = (msg.get("text") or "").strip()
    if not text:
        return
    if text.startswith("/start"):
        tg("sendMessage", chat_id=chat_id, text=WELCOME, parse_mode="HTML",
           reply_markup={"inline_keyboard": [[{"text": "🎬 Открыть кинотеатр", "url": SITE}]]})
        return
    if text.startswith("/"):
        return
    results = tmdb_search(text)
    if not results:
        tg("sendMessage", chat_id=chat_id,
           text="Ничего не нашёл 😕 Попробуй другое название.")
        return
    top = results[0]
    cap = (
        f"{icon(top)} <b>{html.escape(top['title'])}</b>"
        f"{' (' + top['year'] + ')' if top['year'] else ''}  ⭐ {top['rating']:.1f}\n\n"
        f"{html.escape(trunc(top['overview']))}"
    )
    kb = [[{"text": "▶️ Смотреть", "url": url_for(top)}]]
    for it in results[1:]:
        label = f"{icon(it)} {it['title']}" + (f" ({it['year']})" if it['year'] else "")
        kb.append([{"text": label[:60], "url": url_for(it)}])
    sent = tg("sendPhoto", chat_id=chat_id,
              photo=f"https://image.tmdb.org/t/p/w500{top['poster']}",
              caption=cap, parse_mode="HTML",
              reply_markup={"inline_keyboard": kb})
    if not sent.get("ok"):  # photo can fail (rare) → fall back to text
        tg("sendMessage", chat_id=chat_id, text=cap, parse_mode="HTML",
           reply_markup={"inline_keyboard": kb}, disable_web_page_preview=False)


def poll():
    print("sapkefly-bot polling…", flush=True)
    tg("deleteWebhook")
    offset = 0
    while True:
        try:
            r = http.get(f"{API}/getUpdates", params={"offset": offset, "timeout": 50}, timeout=60)
            for u in (r.json().get("result") or []):
                offset = u["update_id"] + 1
                msg = u.get("message") or u.get("edited_message")
                if msg:
                    try:
                        handle_message(msg)
                    except Exception as e:
                        print("handle err", e, flush=True)
        except Exception as e:
            print("poll err", e, flush=True)
            time.sleep(3)


# ── Channel auto-poster (run via cron: python sapkefly_bot.py --post) ──────────
def resolves_on_hdrezka(title, year, mtype):
    try:
        r = http.get(RESOLVE, params={"q": title, "year": year, "type": mtype}, timeout=30)
        return bool((r.json() or {}).get("stream"))
    except Exception:
        return False


def post_new():
    if not CHANNEL:
        print("CHANNEL not set — skip", flush=True)
        return
    # what's hot right now
    try:
        data = http.get(
            "https://api.themoviedb.org/3/trending/all/week",
            params={"api_key": TMDB, "language": "ru-RU"},
        ).json()
    except Exception as e:
        print("trending err", e, flush=True)
        return
    posted_file = "/root/sapkefly-bot/posted.txt"
    try:
        posted = set(open(posted_file).read().split())
    except Exception:
        posted = set()
    new_ids = []
    for it in (data.get("results") or []):
        mt = it.get("media_type")
        if mt not in ("movie", "tv") or not it.get("poster_path"):
            continue
        key = f"{mt}{it['id']}"
        if key in posted:
            continue
        title = it.get("title") or it.get("name") or ""
        date = it.get("release_date") or it.get("first_air_date") or ""
        year = date[:4] if date else ""
        if not resolves_on_hdrezka(title, year, mt):
            continue  # don't advertise what we can't play
        cap = (
            f"{'🎬' if mt == 'movie' else '📺'} <b>{html.escape(title)}</b>"
            f"{' (' + year + ')' if year else ''}  ⭐ {it.get('vote_average') or 0:.1f}\n\n"
            f"{html.escape(trunc(it.get('overview') or ''))}"
        )
        url = f"{SITE}/{'movie' if mt == 'movie' else 'tv'}/{it['id']}"
        res = tg("sendPhoto", chat_id=CHANNEL,
                 photo=f"https://image.tmdb.org/t/p/w500{it['poster_path']}",
                 caption=cap, parse_mode="HTML",
                 reply_markup={"inline_keyboard": [[{"text": "▶️ Смотреть бесплатно", "url": url}]]})
        if res.get("ok"):
            new_ids.append(key)
            print("posted", key, title, flush=True)
            time.sleep(3)
        if len(new_ids) >= 3:  # a few per run, не спамить
            break
    if new_ids:
        with open(posted_file, "a") as f:
            f.write("\n".join(new_ids) + "\n")


if __name__ == "__main__":
    if "--post" in sys.argv:
        post_new()
    else:
        poll()
