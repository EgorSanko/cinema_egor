
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@/shim/router";
import { getHistory, getPosition } from "@/lib/storage";
import { getTvUser } from "@/lib/tv-auth";
import { getImageUrl } from "@/lib/img";
import { IconSearch, IconLogout } from "@/components/tv/tv-icons";

export type TvCard = {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: string;
  poster: string;
};

export type TvRail = {
  title: string;
  cards: TvCard[];
};

// Card geometry — large, readable from across a room.
// 158 было мало: на 1080p подпись под постером не читалась с дивана.
const CARD_W = 200; // px

// Header controls, navigated left/right when the header row is focused.
// "sport" появляется только у Про (прямой эфир — платная фича).
type HeaderCell = "search" | "logout";

/**
 * TV "10-foot UI" home. Fully D-pad / keyboard driven.
 *
 * Navigation model:
 *  - A header row sits above the rails: [Поиск] [Выйти] (+ the logged-in
 *    email, shown but not focusable). Pressing Up from the first rail moves
 *    focus into the header; Down returns to the rails.
 *  - rail focus = { rail, index } held in React state.
 *  - A window 'keydown' handler mutates focus; we never rely on the browser's
 *    built-in spatial navigation (unreliable in Android TV WebView).
 *  - Enter opens the focused card -> /tv-watch/{type}/{id}, or activates the
 *    focused header control.
 *  - Both e.key AND e.keyCode are handled (37/38/39/40 arrows, 13 Enter).
 *
 * Auth gate: an unauthenticated user is redirected to /tv-login on mount.
 *
 * "Продолжить просмотр" rail: built client-side from getHistory()/positions
 * (started-but-unfinished, deduped, most-recent-first) and PREPENDED to the
 * server rails so it reflects the logged-in user's synced history.
 */
export function TvHome({ rails: serverRails }: { rails: TvRail[] }) {
  const router = useRouter();

  // ── Auth gate ──
  const [user, setUser] = useState<ReturnType<typeof getTvUser>>(null);
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => {
    const u = getTvUser();
    if (!u) {
      router.replace("/tv-login");
      return;
    }
    setUser(u);
    setAuthChecked(true);
  }, [router]);

  // ── Continue-watching rail (client-side, from local history+positions) ──
  const [continueCards, setContinueCards] = useState<TvCard[]>([]);
  const buildContinue = useCallback(() => {
    try {
      const history = getHistory(); // already most-recent-first
      const seen = new Set<string>();
      const cards: TvCard[] = [];
      for (const h of history) {
        const dedupeKey = `${h.type}-${h.id}`;
        if (seen.has(dedupeKey)) continue;
        const pos = getPosition(h.id, h.type, h.season, h.episode);
        // A saved position only exists while unfinished (savePosition removes
        // it past 95%). Fall back to the history entry's own progress/duration.
        const time = pos?.time ?? h.progress ?? 0;
        const dur = pos?.duration ?? h.duration ?? 0;
        if (!(time > 0)) continue; // not actually started
        if (dur > 0 && time / dur > 0.95) continue; // finished
        seen.add(dedupeKey);
        cards.push({
          id: h.id,
          type: h.type,
          title: h.title,
          year: h.first_air_date?.slice(0, 4) || h.release_date?.slice(0, 4) || "",
          // poster_path may be a raw TMDB path OR (for items saved by the TV
          // watch page) an already-proxied full URL — don't double-wrap.
          poster: !h.poster_path
            ? "/logo.png"
            : /^https?:|^\/tmdb-img/.test(h.poster_path)
              ? h.poster_path
              : getImageUrl(h.poster_path, "w500"),
        });
      }
      setContinueCards(cards.slice(0, 18));
    } catch {
      setContinueCards([]);
    }
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    buildContinue();
    // Rebuild when a background sync completes (server history pulled in).
    const onSync = () => buildContinue();
    window.addEventListener("sync-complete", onSync);
    return () => window.removeEventListener("sync-complete", onSync);
  }, [authChecked, buildContinue]);

  // Prepend the continue rail when non-empty (omit entirely when empty).
  const rails = useMemo<TvRail[]>(() => {
    if (continueCards.length > 0) {
      return [{ title: "Продолжить просмотр", cards: continueCards }, ...serverRails];
    }
    return serverRails;
  }, [continueCards, serverRails]);

  // ── Focus state ──
  // inHeader=true => header row owns the D-pad; headerCol indexes HeaderCell.
  const [inHeader, setInHeader] = useState(false);
  const [headerCol, setHeaderCol] = useState(0);
  // Порядок: [Поиск] [Выйти]. (Спорт убран — источник каналов kino.pub уходит.)
  const headerCells = useMemo<HeaderCell[]>(() => ["search", "logout"], []);
  const [focus, setFocus] = useState({ rail: 0, index: 0 });

  // ПОЛКИ ПОЯВЛЯЮТСЯ ПО ОДНОЙ.
  //
  // Samsung 2019 года перестал умирать до главной, когда мы облегчили картинки:
  // по сигналам видно «главная нарисована». Но человек всё равно видит загрузку —
  // значит телевизор успевает построить экран и не выдерживает его ОТРИСОВКИ:
  // пять полок с постерами разом это слишком много работы за один кадр.
  //
  // Поэтому сначала показываем одну полку, а остальные добавляем по очереди с
  // паузой. Телевизор рисует их по частям и успевает выдохнуть между ними.
  // Человек при этом видит содержимое сразу, а не пустой экран.
  // ── ОБЛЕГЧЁННЫЙ РЕЖИМ ДЛЯ САМЫХ СЛАБЫХ ТЕЛЕВИЗОРОВ ──────────────────
  //
  // Samsung 2019 года по сигналам доходит до конца: «главная нарисована», а
  // следом уходит запрос ПЕРВОГО постера — и на этом всё, MSX перезапускается.
  // Данные, разметка и таймеры при этом в порядке: рушится он на картинках.
  //
  // Поэтому там сначала показываем карточки БЕЗ постеров — название на
  // подложке, — а картинки подгружаем потом и строго ПО ОДНОЙ: следующая
  // начинается только когда предыдущая догрузилась. Так одновременно
  // распаковывается ровно одна, а не шестнадцать.
  //
  // Это заодно опыт: доживёт до карточек — причина подтверждена; умрёт и без
  // картинок — значит дело не в них, и искать надо в другом месте.
  const слабый = (() => {
    try { return /Tizen|SMART-TV|Web0S|webOS/i.test(navigator.userAgent || ""); }
    catch { return false; }
  })();
  const [картинокРазрешено, setКартинокРазрешено] = useState(слабый ? 0 : 9999);
  useEffect(() => {
    if (!слабый) return;
    let шаг: ReturnType<typeof setInterval> | null = null;
    const пуск = setTimeout(() => {
      try {
        const i = new Image();
        i.src = "/tv-error?m=" + encodeURIComponent("облегчённый режим: пускаю картинки");
      } catch {}
      // Пускаем ПО ЧАСАМ, а не по факту загрузки предыдущей.
      //
      // Сначала следующая картинка ждала, пока догрузится предыдущая. Но
      // очередь идёт по сквозному номеру, а рисуются только карточки рядом с
      // фокусом — и как только очередь упиралась в номер за пределами окна,
      // грузить было некому, никто не сообщал о загрузке, и всё вставало на
      // восьмой картинке. По часам такого тупика нет.
      шаг = setInterval(() => {
        setКартинокРазрешено((n) => {
          if (n >= 60) { if (шаг) clearInterval(шаг); return n; }
          return n + 1;
        });
      }, 250);
    }, 6000);
    return () => { clearTimeout(пуск); if (шаг) clearInterval(шаг); };
  }, [слабый]);

  // ЧАСЫ ЖИЗНИ. Samsung умирает после «главная нарисована», не загрузив ни
  // одной картинки, — значит гибнет на самой отрисовке. Сигналы через равные
  // промежутки покажут, сколько экран прожил: по последнему дошедшему видно,
  // на какой секунде он погас.
  useEffect(() => {
    const метки = [1, 2, 4, 8, 15].map((с) =>
      setTimeout(() => {
        try {
          const i = new Image();
          i.src = "/tv-error?m=" + encodeURIComponent("жив: " + с + "с после отрисовки");
        } catch {}
      }, с * 1000),
    );
    return () => { for (const t of метки) clearTimeout(t); };
  }, []);

  const [полокПоказано, setПолокПоказано] = useState(1);
  useEffect(() => {
    if (полокПоказано >= rails.length) return;
    // Полки добавляем реже: телевизору нужно время на каждую отрисовку.
    const t = setTimeout(() => setПолокПоказано((n) => n + 1), 900);
    return () => clearTimeout(t);
  }, [полокПоказано, rails.length]);
  // Если человек ушёл вниз быстрее, чем полки успели появиться, — показываем
  // сразу столько, сколько нужно, чтобы фокус не упирался в пустоту.
  useEffect(() => {
    if (focus.rail + 2 > полокПоказано) setПолокПоказано(Math.min(rails.length, focus.rail + 2));
  }, [focus.rail, полокПоказано, rails.length]);

  const cardRefs = useRef<(HTMLButtonElement | null)[][]>([]);
  const headerRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const open = useCallback(
    (card: TvCard | undefined) => {
      if (!card) return;
      router.push(`/tv-watch/${card.type}/${card.id}`);
    },
    [router]
  );

  const logout = useCallback(() => {
    const email = user?.email;
    if (email) {
      // Push local data to the server before clearing — mirrors auth-context.logout.
      try {
        const data = {
          favorites: JSON.parse(localStorage.getItem("kino_favorites") || "[]"),
          history: JSON.parse(localStorage.getItem("kino_history") || "[]"),
          positions: (() => {
            const p: Record<string, unknown> = {};
            for (let i = 0; i < localStorage.length; i++) {
              const key = localStorage.key(i);
              if (key?.startsWith("kino_pos_")) {
                try { p[key] = JSON.parse(localStorage.getItem(key) || "null"); } catch {}
              }
            }
            return p;
          })(),
          comments: JSON.parse(localStorage.getItem("kino_comments") || "[]"),
        };
        fetch("/api/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "save", email, data }),
        }).catch(() => {});
      } catch {}
    }
    localStorage.removeItem("user");
    router.replace("/tv-login");
  }, [user, router]);

  // Drive real DOM focus + smooth-scroll from the focus state.
  useEffect(() => {
    if (!authChecked) return;
    if (inHeader) {
      headerRefs.current[headerCol]?.focus({ preventScroll: true });
      return;
    }
    const el = cardRefs.current[focus.rail]?.[focus.index];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" });
  }, [focus, inHeader, headerCol, authChecked]);

  useEffect(() => {
    if (!authChecked) return;
    const handler = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const key = e.key;

      const isLeft = key === "ArrowLeft" || code === 37;
      const isUp = key === "ArrowUp" || code === 38;
      const isRight = key === "ArrowRight" || code === 39;
      const isDown = key === "ArrowDown" || code === 40;
      const isEnter = key === "Enter" || code === 13;

      if (!isLeft && !isUp && !isRight && !isDown && !isEnter) return;
      e.preventDefault();

      // Header row handling.
      if (inHeader) {
        if (isDown) {
          setInHeader(false);
          setFocus((p) => ({ rail: 0, index: Math.min(p.index, Math.max(0, (rails[0]?.cards.length ?? 1) - 1)) }));
        } else if (isLeft) {
          setHeaderCol((c) => Math.max(0, c - 1));
        } else if (isRight) {
          setHeaderCol((c) => Math.min(headerCells.length - 1, c + 1));
        } else if (isEnter) {
          const cell = headerCells[headerCol];
          if (cell === "search") router.push("/tv-search");
          else if (cell === "logout") logout();
        }
        // isUp: no-op (already at top)
        return;
      }

      setFocus((prev) => {
        const railCount = rails.length;
        if (railCount === 0) return prev;

        let { rail, index } = prev;

        if (isLeft) {
          index = Math.max(0, index - 1);
        } else if (isRight) {
          const len = rails[rail].cards.length;
          index = Math.min(len - 1, index + 1);
        } else if (isUp) {
          if (rail === 0) {
            // Leave the rails, enter the header row.
            setInHeader(true);
            return prev;
          }
          rail = Math.max(0, rail - 1);
          index = Math.min(index, rails[rail].cards.length - 1);
        } else if (isDown) {
          rail = Math.min(railCount - 1, rail + 1);
          index = Math.min(index, rails[rail].cards.length - 1);
        } else if (isEnter) {
          open(rails[rail].cards[index]);
          return prev;
        }

        return { rail, index };
      });
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rails, open, inHeader, headerCol, authChecked, logout, router, headerCells]);

  // Focus the very first card on mount / once authed.
  useEffect(() => {
    if (!authChecked) return;
    const el = cardRefs.current[0]?.[0];
    if (el) el.focus({ preventScroll: true });
  }, [authChecked]);

  // Don't flash the grid before the auth check resolves.
  if (!authChecked) {
    return (
      <main
        className="min-h-screen bg-background text-foreground flex items-center justify-center"
        style={{ background: "var(--background)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="" className="h-16 w-auto opacity-70" draggable={false} />
      </main>
    );
  }

  // Какие карточки показывать картинкой: соседние полки и окно вокруг
  // выбранной карточки. Всё остальное — серая заглушка того же размера, так
  // что вёрстка не прыгает, а память не забивается.
  const РЯДОМ_ПОЛОК = 1;
  const РЯДОМ_КАРТОЧЕК = 7;
  // Сквозной номер карточки — по нему решаем, чья очередь грузить картинку.
  //
  // Именно СКВОЗНОЙ, а не «полка × 100 + позиция»: при таком счёте вторая полка
  // получала номер 100, очередь до неё не доходила никогда, и картинки
  // застревали на восьмой. Считаем от начала: длины предыдущих полок плюс
  // позиция в текущей.
  const номерКарточки = (rIdx: number, cIdx: number) => {
    let n = 0;
    for (let i = 0; i < rIdx; i++) n += rails[i].cards.length;
    return n + cIdx;
  };
  const рядом = (rIdx: number, cIdx: number) =>
    Math.abs(rIdx - focus.rail) <= РЯДОМ_ПОЛОК &&
    cIdx <= Math.max(focus.index, 0) + РЯДОМ_КАРТОЧЕК &&
    cIdx >= Math.max(focus.index, 0) - РЯДОМ_КАРТОЧЕК;

  return (
    <main
      className="bg-background text-foreground select-none"
      // ЛИСТАЕТСЯ НЕ ВСЯ СТРАНИЦА, А ТОЛЬКО ОБЛАСТЬ С КАРТОЧКАМИ.
      //
      // Так устроен Deeplex, и поэтому у него шапка никуда не девается. У нас
      // прокручивалась вся страница: шапка уезжала за верх кадра, а когда я
      // закрепил её поверх — стала перекрывать карточки. Оба варианта плохие.
      //
      // Теперь экран — колонка фиксированной высоты: шапка сверху, под ней
      // область, которая листается сама. Шапке физически некуда уехать, и
      // перекрывать она ничего не может. Никаких закреплений не нужно.
      style={{ background: "var(--background)", height: "100%", overflow: "hidden" }}
    >
      {/* Top bar — brand logo + email + focusable controls (Поиск / Выйти) */}
      <header
        // Закреплена сверху: раньше уезжала совсем, и «Поиск»/«Выйти» становились
        // недоступны, пока не пролистаешь обратно.
        className="z-30"
        // ЖЁСТКОЕ закрепление, а не «липкое».
        //
        // «Липкое» (sticky) требует, чтобы ни у одного предка не было скрытого
        // переполнения, а у нас оно стоит на body — на части движков
        // закрепление из-за этого молча не работает, и шапка улетает вверх при
        // первой же прокрутке. Именно это Егор и видел: ни логотипа, ни
        // «Поиска», сколько ни листай.
        //
        // Жёсткое закрепление таких требований не имеет и работает на движках
        // с 2008 года. Отступ сверху — та же безопасная граница, что и у
        // содержимого: телевизор срезает край кадра.
        // Раскладка задана НАПРЯМУЮ, а не служебными классами.
        //
        // На телевизоре Егора правая часть шапки (почта, «Поиск», «Выйти»)
        // уезжала на середину экрана поверх карточек, хотя в браузере при том же
        // размере кадра всё стояло в одну строку. Значит часть классов там не
        // применяется, а какие именно — вслепую не выяснить. Поэтому высоту,
        // выравнивание и распределение задаём стилем: это не зависит ни от
        // одного класса и работает на любом движке.
        //
        // Заодно убрана пустая распорка на flex-1 — вместо неё обычное
        // «прижать края».
        style={{
          // Шапка в ОБЫЧНОМ потоке: прокручивается вместе со страницей.
          //
          // Закреплённой она перекрывала карточки при прокрутке, и Егор
          // попросил вернуть как было. Раскладку (высоту, выравнивание,
          // распределение) оставляем заданной напрямую — именно из-за
          // служебных классов правая часть уезжала на середину экрана.
          // Видимость при запуске обеспечивает отступ от края у содержимого:
          // телевизор срезает край кадра.
          height: 92,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingLeft: 48,
          paddingRight: 48,
          boxSizing: "border-box",
          background: "var(--background)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="SAPKEFLY KINO"
          draggable={false}
          className="h-10 w-auto"
          style={{ filter: "drop-shadow(0 0 18px rgba(163,230,53,0.45))" }}
        />
        {/* Правая часть — одной группой: почта и кнопки. Раскладка группы тоже
            задана стилем, чтобы не зависеть от служебных классов. */}
        <div style={{ display: "flex", alignItems: "center" }}>
        {user && (
          <div className="flex items-center" style={{ marginRight: 16 }}>
            <span
              className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold uppercase"
              style={{ background: "var(--primary)", color: "var(--primary-foreground)" }}
            >
              {(user.email || "?").trim().charAt(0)}
            </span>
            <span className="text-sm text-muted-foreground truncate max-w-[200px]">
              {user.email}
            </span>
          </div>
        )}
        {headerCells.map((cell, i) => {
          const focused = inHeader && headerCol === i;
          const label = cell === "search" ? "Поиск" : "Выйти";
          const Icon = cell === "search" ? IconSearch : IconLogout;
          return (
            <button
              key={cell}
              ref={(node) => { headerRefs.current[i] = node; }}
              tabIndex={focused ? 0 : -1}
              onClick={() => {
                setInHeader(true);
                setHeaderCol(i);
                if (cell === "search") router.push("/tv-search");
                else logout();
              }}
              onFocus={() => { setInHeader(true); setHeaderCol(i); }}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-base font-semibold outline-none transition-transform duration-100"
              style={{
                background: focused ? "var(--primary)" : "var(--card)",
                color: focused ? "var(--primary-foreground)" : "var(--foreground)",
                transform: focused ? "scale(1.06)" : "scale(1)",
                boxShadow: focused
                  ? "0 0 0 4px var(--primary), 0 10px 28px rgba(0,0,0,0.55)"
                  : "0 2px 10px rgba(0,0,0,0.4)",
              }}
            >
              <Icon size={20} />
              {label}
            </button>
          );
        })}
        </div>
      </header>

      {/* Vertical stack of rails */}
      <div
        className="flex flex-col gap-7 pb-16"
        // Высота — всё, что осталось под шапкой. calc и обычная прокрутка
        // понятны любому движку; ни flex-1, ни новых свойств здесь нет
        // намеренно: именно на них мы уже дважды обожглись.
        style={{ height: "calc(100% - 92px)", overflowY: "auto" }}
      >
        {rails.slice(0, полокПоказано).map((rail, rIdx) => (
          <section key={rail.title}>
            <h2 className="px-12 mb-2 text-xl font-bold text-foreground">
              {rail.title}
            </h2>
            <div
              // ВАЖНО: overflow-x режет и по вертикали — подпись под постером обрезалась
              // пополам, а карточка в фокусе упиралась в край. Отсюда запас.
              className="flex gap-4 overflow-x-auto px-12 pt-2 pb-6"
              style={{ scrollbarWidth: "none" }}
            >
              {rail.cards.map((card, cIdx) => {
                const focused =
                  !inHeader && focus.rail === rIdx && focus.index === cIdx;
                return (
                  <button
                    key={`${card.type}-${card.id}`}
                    ref={(node) => {
                      if (!cardRefs.current[rIdx]) cardRefs.current[rIdx] = [];
                      cardRefs.current[rIdx][cIdx] = node;
                    }}
                    tabIndex={focused ? 0 : -1}
                    onClick={() => {
                      setInHeader(false);
                      setFocus({ rail: rIdx, index: cIdx });
                      open(card);
                    }}
                    onFocus={() => { setInHeader(false); setFocus({ rail: rIdx, index: cIdx }); }}
                    className="group shrink-0 rounded-xl text-left outline-none"
                    // На слабых телевизорах — БЕЗ плавных переходов и без
                    // увеличения в фокусе. Каждый такой эффект заставляет
                    // движок пересобирать слои, а их тут семьдесят: именно на
                    // отрисовке Samsung и гаснет, не дойдя до картинок.
                    style={{
                      width: CARD_W,
                      transform: слабый ? undefined : (focused ? "scale(1.08)" : "scale(1)"),
                      transition: слабый ? undefined : "transform .15s ease-out",
                    }}
                  >
                    <div
                      className="relative overflow-hidden rounded-xl bg-card"
                      style={{
                        // Тень только у выбранной карточки: рисовать её у
                        // всех семидесяти — лишняя работа для телевизора.
                        boxShadow: focused
                          ? (слабый ? "0 0 0 4px var(--primary)" : "0 0 0 4px var(--primary), 0 16px 40px rgba(0,0,0,0.6)")
                          : (слабый ? "none" : "0 4px 16px rgba(0,0,0,0.4)"),
                      }}
                    >
                      {/* ОКОННАЯ ОТРИСОВКА.
                          Картинку создаём только у карточек рядом с фокусом.
                          Раньше рисовались все девяносто сразу, и Samsung
                          2019 года падал на этом молча: страница умирала
                          через секунду после старта. `loading="lazy"` не
                          помощник — этот движок её не знает. */}
                      {рядом(rIdx, cIdx) && номерКарточки(rIdx, cIdx) < картинокРазрешено ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.poster}
                          alt={card.title}
                          draggable={false}
                          className="block w-full object-cover"
                          // Та же причина: aspect-ratio на телевизорах не
                          // работает, поэтому высоту задаём числом.
                          style={{ height: Math.round(CARD_W * 1.5) }}
                        />
                      ) : (
                        <div
                          className="block w-full"
                          // Высота ЯВНО в точках, а не через aspect-ratio:
                          // это свойство появилось в Chrome 88, телевизоры его
                          // не знают и схлопывают заглушку в ноль — на экране
                          // получались тонкие белые полосы вместо карточек.
                          style={{
                            height: Math.round(CARD_W * 1.5),
                            background: "rgba(255,255,255,.06)",
                            padding: 10,
                            boxSizing: "border-box",
                            overflow: "hidden",
                            fontSize: 13,
                            lineHeight: "1.25",
                            color: "#d4d4d8",
                          }}
                        >
                          {card.title}
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5 px-1">
                      <p
                        className="truncate text-base font-semibold text-foreground"
                        title={card.title}
                      >
                        {card.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {card.year}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
