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
      name: "SAPKEFLY KINO",
      version: "1.0.0",
      // Фирменное оформление. MSX — White Label: логотип, фон, заголовок и
      // прозрачность меню задаёт провайдер, поэтому каталоги разных сервисов
      // и выглядят по-разному. Раньше мы этим не пользовались вовсе.
      logo: "https://sapkeflykino.ru/logo.png",
      logoSize: "large",
      background: "https://sapkeflykino.ru/intro-logo-v2.jpg",
      style: "default",
      transparent: 2,
      headline: "Фильмы и сериалы",
      // MSX ждёт ОБЪЕКТ МЕНЮ: массив menu, у каждого пункта — data с контентом
      // или ссылкой на него. Если отдать сразу контент, приложение отвечает
      // «Menu is missing» (проверено на живом телевизоре).
      menu: [
        // ГЛАВНЫЙ пункт: отдаём управление нашему собственному ТВ-клиенту.
        // MSX умеет запускать внешнее HTML-приложение действием
        // system:hbbtv:launch — тогда человек видит НАШ интерфейс целиком, а не
        // витрину MSX. Поддержка зависит от телевизора, поэтому рядом лежит
        // запасной пункт с обычной ссылкой, а ниже — каталог внутри MSX,
        // который работает везде без исключений.
        {
          label: "Полная версия",
          icon: "msx-white-soft:launch",
          data: {
            type: "list",
            headline: "Полная версия SAPKEFLY KINO",
            template: { type: "separate", layout: "0,0,8,2", color: "msx-glass" },
            items: [
              {
                title: "Запустить приложение",
                titleFooter: "наш интерфейс: поиск, продолжение просмотра, озвучки",
                icon: "launch",
                action: "system:hbbtv:launch:https://sapkeflykino.ru/tvapp/",
              },
              {
                title: "Открыть в браузере телевизора",
                titleFooter: "если предыдущий пункт не сработал",
                icon: "language",
                action: "link:window:https://sapkeflykino.ru/tvapp/",
              },
            ],
          },
        },
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
                action: "info:Каталог здесь работает на любом телевизоре. За полным интерфейсом — пункт «Полная версия» в меню или адрес sapkeflykino.ru/tvapp/ в браузере телевизора.",
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
