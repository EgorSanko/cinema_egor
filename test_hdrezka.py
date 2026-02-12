import asyncio
from hdrezka import Search
from hdrezka.api.http import login_global

async def main():
    await login_global("egorsanko@bk.ru", "Yachmen007")
    results = await Search("Интерстеллар").get_page(1)
    if results:
        r = results[0]
        print("NAME:", r.name)
        print("INFO:", r.info)
        print("URL:", r.url)
        player = await r.player
        print("PLAYER TYPE:", type(player))
        print("_translator:", player._translator)
        print("DIR _translator:", dir(player._translator))
        # Try get_stream without args
        try:
            stream = await player.get_stream()
            print("STREAM TYPE:", type(stream))
            print("STREAM DIR:", dir(stream))
            print("VIDEO:", dir(stream.video) if hasattr(stream, 'video') else "no video")
            if hasattr(stream, 'video'):
                v = stream.video
                print("RAW:", v.raw_data if hasattr(v, 'raw_data') else "no raw_data")
        except Exception as e:
            print("STREAM ERROR:", e)

asyncio.run(main())
