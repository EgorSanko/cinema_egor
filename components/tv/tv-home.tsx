"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getHistory, getPosition } from "@/lib/storage";
import { getTvUser } from "@/lib/tv-auth";
import { getImageUrl } from "@/lib/tmdb";
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
// Ширина карточки. 158 было мало: на телевизоре 1080p с дивана подпись под
// постером не читалась вовсе. 200 даёт шесть с половиной карточек в ряд —
// видно, что полоса продолжается, и текст уже разборчив.
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
  const [полокПоказано, setПолокПоказано] = useState(1);
  useEffect(() => {
    if (полокПоказано >= rails.length) return;
    const t = setTimeout(() => setПолокПоказано((n) => n + 1), 350);
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
        // Закреплена сверху: раньше при прокрутке вниз уходила совсем, и
        // «Поиск» с «Выйти» становились недоступны, пока не пролистаешь обратно.
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
              // ВАЖНО: overflow-x режет и по вертикали. Из-за этого подпись под
              // постером обрезалась пополам, а карточка в фокусе (она крупнее на
              // 8 %) упиралась в край. Поэтому запас сверху и снизу.
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
                    className="group shrink-0 rounded-xl text-left outline-none transition-transform duration-150 ease-out"
                    style={{
                      width: CARD_W,
                      transform: focused ? "scale(1.08)" : "scale(1)",
                    }}
                  >
                    <div
                      className="relative overflow-hidden rounded-xl bg-card"
                      style={{
                        boxShadow: focused
                          ? "0 0 0 4px var(--primary), 0 16px 40px rgba(0,0,0,0.6)"
                          : "0 4px 16px rgba(0,0,0,0.4)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={card.poster}
                        alt={card.title}
                        loading="lazy"
                        draggable={false}
                        className="block w-full object-cover"
                        style={{ aspectRatio: "2 / 3" }}
                      />
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
