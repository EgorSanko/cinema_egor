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
      // Автозапуск обёртки УБРАН. Пробовали system:hbbtv:launch — Samsung
      // Егора отвечает «Current platform does not support the action», то есть
      // передавать управление внешнему приложению этот телевизор не умеет, и
      // человек получал ошибку при каждом старте.
      //
      // Как это устроено у других (разобрано по их же файлам): пользователи
      // вводят НЕ адрес кинотеатра, а портал msxplayer.ru, и его старт-параметр
      // выглядит так: menu:request:interaction:menu@.../store.html — то есть
      // меню генерирует плагин взаимодействия, а каждое «приложение» в списке
      // это тоже плагин, который рисует контент через саму MSX
      // (content:request:interaction:, interaction:load:). Свой HTML там не
      // показывает никто, включая их: рисует всегда MSX.
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
                // Обычный link: — ровно так открываются ВСЕ кинотеатры в
                // портале NoName: Deeplex → link:http://smart.deeplex.cc,
                // Zona, VoKino, Filmix, Lampa. Проверено по их списку.
                // Раньше здесь стоял system:hbbtv:launch, и Samsung отвечал
                // «Current platform does not support the action».
                action: "link:https://sapkeflykino.ru/tvweb/",
              },
              {
                title: "Открыть в отдельном окне",
                titleFooter: "если предыдущий пункт не сработал",
                icon: "language",
                action: "link:window:https://sapkeflykino.ru/tvweb/",
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
                titleFooter: "sapkeflykino.ru/tvweb/",
                icon: "language",
                action: "info:Каталог здесь работает на любом телевизоре. За полным интерфейсом — пункт «Полная версия» в меню или адрес sapkeflykino.ru/tvweb/ в браузере телевизора.",
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
