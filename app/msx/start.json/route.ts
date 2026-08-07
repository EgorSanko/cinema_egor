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
      launcher: {
        icon: "blank",
        image: "https://sapkeflykino.ru/icon-512.png",
        color: "msx-black",
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
