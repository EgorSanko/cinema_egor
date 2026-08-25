import { NextResponse } from "next/server";

/**
 * Главное меню для Media Station X.
 *
 * Раньше здесь лежал диагностический набор из двух тайтлов — им проверяли,
 * потянет ли старый телевизор наш HLS. Проверка пройдена, теперь это настоящее
 * меню каталога; содержимое разделов отдаёт /msx/feed.json.
 *
 * Разделы грузятся ПО ССЫЛКЕ, а не все сразу: MSX подтягивает содержимое,
 * когда человек заходит в раздел. Иначе на открытие меню уходили бы десятки
 * секунд — резолв каждого тайтла ходит во внешние источники.
 */
export const dynamic = "force-dynamic";

const FEED = "https://sapkeflykino.ru/msx/feed.json";

export async function GET() {
  return NextResponse.json(
    {
      headline: "SAPKEFLY KINO",
      // MSX ждёт ОБЪЕКТ МЕНЮ: массив menu, у каждого пункта — data с контентом
      // или ссылкой на него. Если отдать сразу контент, приложение отвечает
      // «Menu is missing» (проверено на живом телевизоре).
      menu: [
        { label: "Сейчас в тренде", icon: "msx-white-soft:whatshot", data: `${FEED}?view=list&cat=trending` },
        { label: "Сериалы", icon: "msx-white-soft:live-tv", data: `${FEED}?view=list&cat=tv` },
        { label: "Новинки", icon: "msx-white-soft:new-releases", data: `${FEED}?view=list&cat=latest` },
        {
          label: "О приложении",
          icon: "msx-white-soft:info",
          data: {
            type: "list",
            headline: "SAPKEFLY KINO",
            template: { type: "separate", layout: "0,0,8,2", color: "msx-glass" },
            items: [
              {
                title: "Полная версия — в браузере телевизора",
                titleFooter: "sapkeflykino.ru/tvapp/",
                icon: "language",
                action: "info:Откройте в браузере телевизора адрес sapkeflykino.ru/tvapp/ — там наш собственный интерфейс: поиск, продолжение просмотра, выбор озвучки и качества. Здесь, внутри Media Station X, интерфейс рисует она сама.",
              },
            ],
          },
        },
      ],
    },
    {
      headers: {
        "Cache-Control": "no-store",
        // Без этого заголовка MSX показывает «Data Load Error» — запрос к нам
        // идёт кросс-доменно и молча блокируется браузером.
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
