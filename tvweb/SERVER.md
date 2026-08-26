# ТВ-обёртка: что настроено на сервере

Часть решения живёт не в коде, а в nginx на веб-VPS (72.56.245.240,
`/etc/nginx/sites-enabled/kino`). Бэкапы конфига — `/root/nginx-backups/`.

## 1. Адрес обёртки меняется при каждом открытии

```
location = /tvweb/ {
    if ($args = "") { return 302 /tvweb/?t=$msec; }
    root /var/www;                      # НЕ alias: alias вместе с проверкой
    try_files /tvweb/index.html =404;   # выше даёт 500 — проверено вживую
    ...no-store, no-cache, etag off, if_modified_since off
}
```

Зачем: Samsung на Tizen 5 держал страницу в своей памяти намертво и за новой
версией не ходил вовсе — в логе видно, как он забирает файлы приложения, а саму
страницу не запрашивает. Все правки уходили в пустоту почти сутки. Метка времени
даёт адрес, которого в его памяти быть не может.

## 2. Запуск из MSX

Файлы отдаются с диска (`/var/www/msx-static/`), мимо Next — правка применяется
сразу, без пересборки сайта:

- `/msx/start.json` → `content:https://sapkeflykino.ru/msx/launch.json`
- `/msx/launch.json` → действие `link:window:https://sapkeflykino.ru/tvweb/`

### Схема запуска — снята с боевого файла Deeplex

`deeplex.cc/msx/start.json` устроен так:

```json
"parameter": "content:https://deeplex.cc/msx/start.json",
"action": "[settings:validate_links:0|link:https://smart.deeplex.cc]"
```

Три вещи, без которых не работает:

1. Квадратные скобки — **два действия подряд**. Сначала
   `settings:validate_links:0` выключает предупреждение «ссылка может подвесить
   приложение», из-за которого обычный `link:` не открывался вообще.
2. Дальше именно `link:`, а **не** `link:window:`. `window` выкидывает в браузер
   телевизора — на LG это видно глазами. Простой `link:` держит обёртку ВНУТРИ
   MSX, как у Deeplex.
3. Файл ссылается сам на себя (`content:` на свой же адрес), поэтому действие
   срабатывает сразу при запуске, без пунктов меню.

Стартовый параметр принимает только `menu:` или `content:` — прямая ссылка
отвергается: «Invalid start parameter».

### MSX может проигнорировать стартовый параметр

На отладочном экране телевизора: `Use restored content state as start options`.
MSX восстанавливает прошлое состояние и до `start.json` не доходит — в логе он
сразу дёргает `menu.json`. Лечится пересборкой параметра: Настройки → Start
Parameter → Setup. Поэтому запуск продублирован и в меню (пункт «СМОТРЕТЬ»).

Обоим файлам нужен `Access-Control-Allow-Origin: *` — MSX работает со своего
домена и забирает их межсайтовым запросом, иначе «Data Load Error».

Меню `/msx/menu.json` (его отдаёт Next) осталось как запасной вход.

## 3. Служебный аккаунт для автопроверок

`tv-selftest@sapkeflykino.ru` в `users.json`. Заведён отдельной записью, чужие не
тронуты, бэкапы `/root/users.json.bak_selftest_*`. Пароль — вне репозитория.
