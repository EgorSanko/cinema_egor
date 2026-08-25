import { NextResponse } from "next/server";

/**
 * Стартовый параметр для Media Station X (msx.benzac.de).
 *
 * MSX ставится из магазина Samsung/LG и НЕ является установщиком APK: у неё
 * собственный интерфейс, а данные она читает по этому адресу. Видео запускает
 * ШТАТНЫЙ плеер телевизора — поэтому старые Tizen/webOS, которые не тянут наш
 * сайт (там движок 2015 года: нет CSS-переменных, слоёв, Grid), здесь работают.
 *
 * Пользователь один раз вбивает в настройках MSX:
 *   sapkeflykino.ru/msx/start.json
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    {
      name: "SAPKEFLY KINO",
      version: "1.0.0",
      parameter: "menu:https://sapkeflykino.ru/msx/menu.json",
      welcome: "none",
      note: "Онлайн-кинотеатр: фильмы и сериалы",
      // Объект launcher — формат сторонних лаунчеров и порталов MSX
      // (msxplayer.ru и подобных). Именно так подключены Deeplex и остальные:
      // портал показывает список приложений, и запуск идёт этим параметром.
      // Без него нас в такой список просто не добавить.
      //
      // Внутри — link: на веб-версию MSX с НАШИМ стартовым параметром и
      // leave=1: лаунчер закрывается, человек попадает сразу к нам.
      launcher: {
        parameter:
          "link:https://msx.benzac.de/?start=menu:https://sapkeflykino.ru/msx/menu.json&leave=1",
        icon: "movie",
        image: "https://sapkeflykino.ru/icon-512.png",
        color: "#a3e635",
      },

    },
    {
      headers: {
        "Cache-Control": "no-store",
        // MSX — стороннее приложение (msx.benzac.de и веб-обёртки на ТВ), оно
        // читает наш JSON кросс-доменно. Без этого заголовка браузер молча
        // блокирует запрос, и MSX показывает «Data Load Error» (проверено).
        "Access-Control-Allow-Origin": "*",
      },
    },
  );
}
