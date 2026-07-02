# Полный переход с TMDB на HDRezka — план миграции

> Ветка `hdrezka-migration`. Цель: убрать TMDB полностью, вести весь каталог/метаданные от HDRezka.
> Прод (`revamp`) не трогаем — вливаем «по щелчку», когда всё зелёное.
> Составлено 2026-07-02 после research реальных возможностей HDRezka.

## Зачем (боли, которые это решает)
1. **Баги резолва по названию** — сейчас TMDB даёт *строку*, HDRezka *угадывает* → «не то показывает» / «есть на HDRezka, у нас нет». Уходит полностью: у нас сразу HDRezka-URL, воспроизведение = прямой резолв.
2. **Тупиковые карточки** — TMDB показывает фильмы, которых нет в цифре (нет на HDRezka) → «иллюзия кинотеатра». Витрина = только реально смотрибельное.
3. **Меньше запросов/задержки** — нет двойного хопа TMDB→HDRezka и прокси-обёрток.
4. **Независимость от TMDB** — прокси `/tmdb-api` + `/tmdb-img` (TMDB заблокирован в РФ) больше не критичны.

## Вывод research: HDRezka отдаёт ВСЁ нужное (и местами больше)
`Player.post.info` уже экспонирует наша либа `hdrezka`:
| Данные | Атрибут | Пример |
|---|---|---|
| Описание | `description` | ✓ |
| Оригинальное имя | `orig_title` | «Dune: Part Two / Dune 2» |
| Год/дата | `release` | Release(day='13 марта', year=2024) |
| Жанры | `genre` | (Hyperlink «Фантастика»→/films/fiction/, …) |
| Страны | `country` | (Hyperlink …) |
| Хронометраж | `duration` | 9900 (сек) |
| Постер | `poster` | full + preview (statichdrezka.ac) |
| Рейтинги | `ratings` | imdb 8.4/767398, kp 8.18/227196, hdrezka |
| Актёры | `persons` | Person(id, url, name, **image, birthday, birthplace, career, height**) |
| Режиссёры | `directors` | Person(…) |
| Возраст | `age_rating` | AgeRating(age=12, description=…) |
| Тем. коллекции | `collections` | «Экранизации литературы», «Про инопланетян» |
| Франшиза | `post.franchises` | FranchiseInfo(url) — все части серии |
| Рейтинг-топы | `rankings` | «Лучшая фантастика 2024 года» №1 |
| Качество | `quality` | 720p… |

Плюс живые каталоги (research подтверждён, по 45 карт/стр, пагинация `?page=N`):
- `/films/`, `/series/`, `/cartoons/`, `/animation/` — новинки категории
- `/new/` — новинки всего
- `/films/best/` — лучшее/популярное; `/films/best/fiction/2024/` — лучшее по жанру+году (rankings)
- `?filter=watching` — сейчас смотрят; `?filter=popular`, `?filter=soon`
- жанровые под-каталоги `/films/fiction/`, `/films/action/`, … (из `genre` Hyperlink)
- тематические коллекции `/collections/…`
- **Трейлер**: `POST /engine/ajax/gettrailervideo.php {id}` → `code` c `<iframe … youtube.com/embed/<YT_ID>…>` → достаём YouTube id (как у TMDB).
- **Актёры**: `/person/<id>-<slug>/` — полноценная страница (фото, био, фильмография).

---

## 1. Инвентаризация TMDB (что заменяем) — из `lib/tmdb.ts` + 63 файла

| TMDB-функция | Где используется | HDRezka-замена |
|---|---|---|
| `getTrendingMovies/TV`, `getPopularMovies/TV`, `getLatestMovies` | главная (`app/page.tsx`, `tv-home`), ленты | каталоги `best/` (популярное), `new/`/`?filter=watching` (тренд), категория (новинки) |
| `getMoviesByGenre`/`getTVByGenre`, `getGenres`/`getTVGenres`, `getGenreInfo` | `/genre`, `genre-grid`, browse | жанр-каталоги `/films/<genre>/` + фикс-список жанров HDRezka |
| `getMovieDetails`/`getTVDetails` (+credits) | `/movie/[id]`, `/tv/[id]`, плееры | `Player(url).post.info` (всё выше) |
| `getTVSeasonEpisodes` | сериал: сезоны/серии | `PlayerSeries.get_episodes(translator_id)` (уже есть `/api/episodes`) |
| `getMovieRecommendations`/`getTVRecommendations` (+similar) | `recommendations.tsx` | «С этим смотрят» + `collections` + `rankings` (тот же жанр/год) |
| `searchMovies`/`searchTV` | поиск | уже HDRezka-driven (`lib/search/unified.ts`, `/api/find`) — добьём до 100% |
| `searchPeople`, `getPersonDetails` (+combined_credits) | `/person/[id]`, поиск людей | `/person/<id>` HDRezka (Person + фильмография) |
| `getCollection` (франшиза) | «Часть серии» | `post.franchises` + `collections` |
| `getMovieVideos`/`getTVVideos`, `pickBestTrailer` | MovieTok `/feed`, `trailer-modal`, swipe | `gettrailervideo.php` → YouTube id |
| `getImageUrl`/`getBackdropUrl`/`profileUrl` | везде (постеры/фоны/лица) | постеры HDRezka через nginx `^~ /hd-img/` (уже есть) |

Прочие места с `genre_ids`/`vote_average`: `wrapped`, `achievements`, `lib/status.ts`, `lib/feed/*`, `swipe`, `schema.ts` (SEO), `profile` статистика → переводим на HDRezka-жанры (строки/слаги) и HDRezka-рейтинги.

---

## 2. Новые эндпоинты бэкенда (kino-api `hdrezka_server.py`)
Всё кэшируем (как `/api/find`/`/api/details`), лёгкие read-only фетчи (бокс 4ГБ — без тяжёлого).

1. `GET /api/browse?cat=films|series|cartoons|animation&sort=latest|popular|watching|best&genre=<slug>&year=<y>&page=N`
   → парс каталога HDRezka → `[{id, name, year, type, url, poster, rating?}]`. **Питает главную/жанры/бесконечный скролл.**
2. `GET /api/card?url=` (расширить `/api/details`) → полная карточка: `{title, orig_title, description, year, duration, genres[], countries[], age, poster, ratings{imdb,kp,hdrezka}, persons[], directors[], collections[], franchise_url, rankings[], quality}`.
3. `GET /api/trailer?url=` → `{youtube_id}` (из `gettrailervideo.php`).
4. `GET /api/person?url=` → `{name, image, birthday, birthplace, career, height, filmography:[{name,url,poster,year}]}`.
5. `GET /api/franchise?url=` → список частей серии.
6. `GET /api/collection?url=` → тайтлы тематической коллекции (пагинация).
7. `GET /api/genres` → фикс-список жанров HDRezka (name+slug), статикой.
Поиск (`/api/find`) уже есть. Сезоны/серии (`/api/episodes`) уже есть.

**ID-стратегия:** ключ = HDRezka **numeric id** (`post.id`, стабилен) + slug-url. Роут карточки → `/w/<hdrezka_id>` (или переиспользуем `/hd/[token]` c base64url(url)). Отвязываемся от tmdb_id.

---

## 3. Кросс-катящие вопросы (решить до флипа)
- **Картинки:** постеры `statichdrezka.ac` режутся у РФ → всё через nginx `^~ /hd-img/` (уже есть на web-VPS; повторить на новом VPS при миграции). Заменить `getImageUrl` → `hdImg(url)`.
- **Жанры/статистика:** `genre_ids`(число) → HDRezka genre slug/name. Переписать `wrapped`/`achievements`/recommender на слаги. Составить фикс-мэппинг жанров HDRezka.
- **Миграция данных юзеров:** история/избранное/позиции сейчас на `tmdb_id`. Варианты: (а) одноразовый маппинг tmdb_id→hdrezka на бэке при первом входе; (б) дуал-ключ переходный период; (в) принять «мягкий сброс» истории (worst). **Решить с юзером** — рекомендую (а) фоновым резолвом.
- **Блок-лист (RKN/Beget takedowns):** сейчас `BLOCKED_MOVIE_IDS`(tmdb) + `BLOCKED_HD_SLUGS`. После миграции — только slug/hdrezka_id. Уже частично на слагах — доведём.
- **SEO `schema.ts`:** JSON-LD c рейтингом/актёрами — переложить на HDRezka-поля (даже богаче).
- **MovieTok `/feed`:** трейлеры HDRezka (YouTube id) + вкусы на HDRezka-жанрах.
- **`/api/skip-segments`** (интро/аутро) завязан на imdb_id/tmdb — HDRezka `ratings.imdb.url` содержит **imdb tt-id** → берём оттуда, AniSkip/IntroDB продолжают работать.

---

## 4. Фазы с проверками (acceptance на каждой)
Всё в ветке, за флагом `NEXT_PUBLIC_SOURCE=hdrezka` (TMDB-путь остаётся как fallback до флипа).

**Фаза 0 — Бэкенд-фундамент.** Эндпоинты §2 + кэш. ✅ Проверка: curl каждого → валидный JSON на 5 разных тайтлах (фильм/сериал/аниме/мультсериал/новинка).

**Фаза 1 — Карточка.** `/movie|tv|w/[id]` целиком от HDRezka (описание/рейтинги/актёры/жанры/трейлер/похожее/франшиза). ✅ Playwright: 10 тайтлов, всё отображается, плеер играет, трейлер открывается.

**Фаза 2 — Витрина.** Главная + жанры + бесконечный скролл на `/api/browse`. ✅ Главная = только смотрибельное; клик по любой карточке → играет (0 тупиков на выборке 50).

**Фаза 3 — Поиск + люди.** Поиск 100% HDRezka; `/person/[id]` от HDRezka. ✅ Топ-20 запросов дают релевантную выдачу; актёр → его фильмы открываются.

**Фаза 4 — MovieTok/свайп/статистика/SEO.** Трейлеры HDRezka, рекомендатель и wrapped на HDRezka-жанрах, JSON-LD. ✅ `/feed` крутит трейлеры; wrapped считается; schema валидна (Rich Results Test).

**Фаза 5 — Данные юзеров + блок-лист + ТВ.** Миграция истории/избранного; блок только по slug; ТВ-экраны (`tv-home`/`tv-watch`/`tv-search`) от HDRezka. ✅ Старый юзер видит свою историю; заблокированное = 404; ТВ работает (бокс/фильм/сериал).

**Фаза 6 — Флип.** Убрать TMDB-код и прокси-зависимость; смёржить в `revamp`; выкатить. ✅ Финальный чек-лист ниже.

---

## 5. Чек-лист флипа (не переключаемся, пока все не зелёные)
- [ ] Главная, жанры, поиск, карточка (фильм+сериал+аниме+мультсериал), плеер, трейлер, актёры, похожее, франшиза — всё на HDRezka, 0 обращений к api.themoviedb.org.
- [ ] Клик по любой карточке витрины → играет (нет тупиков «нет у нас»).
- [ ] MovieTok, свайп, wrapped, достижения, континью — работают на HDRezka-данных.
- [ ] ТВ (обёртка `/tv-*`) — главная/поиск/карточка/плеер на HDRezka.
- [ ] История/избранное существующих юзеров сохранены (миграция ключей).
- [ ] Блок-лист takedown-ов действует (404 + вне выдачи).
- [ ] Постеры грузятся у РФ-клиента (через /hd-img).
- [ ] SEO: sitemap/schema на HDRezka-URL, без битых TMDB-ссылок.
- [ ] Прод `revamp` не задет до самого мержа; откат = вернуть флаг.

---

## Открытые вопросы к владельцу
1. **Миграция истории/избранного** старых юзеров: фоновый маппинг tmdb→hdrezka (рекомендую) vs мягкий сброс?
2. **Роутинг карточек**: сохранить `/movie/[id]`,`/tv/[id]` (id=hdrezka) для SEO-совместимости или перейти на `/w/[token]`?
3. **MovieTok**: оставляем на трейлерах HDRezka (YouTube) — ок? (Единственное, что тянет YouTube, не HDRezka — но это внешний CDN, не TMDB.)
4. **Порядок фаз**: начать с Фазы 0+1 (карточка) как самой ценной?
