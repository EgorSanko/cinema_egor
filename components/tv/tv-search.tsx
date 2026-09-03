"use client";

import { searchTvUnifiedAction, type TvSearchCard } from "@/app/actions";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconBackspace } from "@/components/tv/tv-icons";

// ---------------------------------------------------------------------------
// On-screen D-pad keyboard.
//   - Compact ЙЦУКЕН / QWERTY / digit layouts (3 letter rows, not a 9-row
//     alphabetical wall) so reaching any key takes few moves.
//   - РУ / EN / 123 mode toggles live in one action row → Latin & digits are a
//     single press away instead of buried below the whole Cyrillic alphabet.
//   - Keys are deliberately small (not the huge tiles from before).
// ---------------------------------------------------------------------------
type Mode = "ru" | "en" | "num";
type KeyDef = {
  label: string;
  value?: string;
  action?: "space" | "del" | "clear" | "mode";
  mode?: Mode;
};

const ROW = (s: string): KeyDef[] => s.split("").map((c) => ({ label: c, value: c }));

const LETTERS: Record<Mode, string[]> = {
  ru: ["ЙЦУКЕНГШЩЗХЪ", "ФЫВАПРОЛДЖЭ", "ЯЧСМИТЬБЮЁ"],
  en: ["QWERTYUIOP", "ASDFGHJKL", "ZXCVBNM"],
  num: ["1234567890", "-.,:!?№"],
};

// One action row shared by every mode: mode switches + space + delete + clear.
const ACTION_ROW: KeyDef[] = [
  { label: "РУ", action: "mode", mode: "ru" },
  { label: "EN", action: "mode", mode: "en" },
  { label: "123", action: "mode", mode: "num" },
  { label: "Пробел", action: "space" },
  { label: "Стереть", action: "del" },
  { label: "Очистить", action: "clear" },
];

function rowsFor(mode: Mode): KeyDef[][] {
  return [...LETTERS[mode].map(ROW), ACTION_ROW];
}

// Клавиша меньше: клавиатура занимала 662 точки из 1280, и результатам
// оставалась узкая полоса — карточки выходили по 123 точки, названия не
// читались. Уменьшение клавиши отдаёт результатам почти двести точек ширины.
const KEY = 36; // px — compact key size
// Три столбца, а не шесть. Шесть осталось от раскладки во всю ширину; когда
// клавиатура переехала влево, карточки сжались до шестидесяти точек: названия
// превращались в «Холод в…», плашка «СЕРИАЛ» — в «СЕРИА», правый столбец резался
// краем. Три столбца дают читаемый размер.
const RESULTS_PER_ROW = 4;

/**
 * TV "10-foot UI" search. Fully D-pad / remote driven, no mouse, no TextInput.
 *
 * Focus model — single source of truth in React state:
 *   focus = { zone, row, col }
 *     - zone "keyboard": (row, col) index into the current mode's rows.
 *     - zone "results":  (row, col) index into a RESULTS_PER_ROW grid of cards.
 *
 * Results now come from the SAME HDRezka-driven engine as the website /search
 * (searchTvUnifiedAction): availability from HDRezka + TMDB enrichment + HDRezka
 * -native titles. TMDB-matched cards open /tv-watch/{type}/{id}; HDRezka-native
 * cards open /tv-hd/{token}. Each card shows a Фильм/Сериал badge so the two are
 * distinguishable, and the title is always visible (emphasised on focus).
 */
export function TvSearch() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<Mode>("ru");
  const [results, setResults] = useState<TvSearchCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const rows = useMemo(() => rowsFor(mode), [mode]);

  const [focus, setFocus] = useState<{ zone: "keyboard" | "results"; row: number; col: number }>({
    zone: "keyboard",
    row: 0,
    col: 0,
  });

  const keyRefs = useRef<(HTMLButtonElement | null)[][]>([]);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const open = useCallback(
    (card: TvSearchCard | undefined) => {
      if (!card) return;
      router.push(card.href);
    },
    [router]
  );

  // ---- Debounced search (~400ms) once query length >= 2 ------------------
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const cards = await searchTvUnifiedAction(q);
        if (cancelled) return;
        setResults(cards.slice(0, 60));
        setSearched(true);
      } catch {
        if (!cancelled) {
          setResults([]);
          setSearched(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // If results shrink while focus is in the results zone, pull focus back so it
  // never lands on a missing card.
  useEffect(() => {
    setFocus((prev) => {
      if (prev.zone !== "results") return prev;
      if (results.length === 0) return { zone: "keyboard", row: 0, col: 0 };
      const maxIdx = results.length - 1;
      const idx = prev.row * RESULTS_PER_ROW + prev.col;
      if (idx <= maxIdx) return prev;
      return { zone: "results", row: Math.floor(maxIdx / RESULTS_PER_ROW), col: maxIdx % RESULTS_PER_ROW };
    });
  }, [results.length]);

  // ---- Drive real DOM focus + smooth-scroll from focus state -------------
  useEffect(() => {
    let el: HTMLElement | null = null;
    if (focus.zone === "keyboard") {
      el = keyRefs.current[focus.row]?.[focus.col] ?? null;
    } else {
      el = resultRefs.current[focus.row * RESULTS_PER_ROW + focus.col] ?? null;
    }
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
  }, [focus, results.length, mode]);

  useEffect(() => {
    keyRefs.current[0]?.[0]?.focus({ preventScroll: true });
  }, []);

  // ---- Apply a key press -------------------------------------------------
  const applyKey = useCallback((k: KeyDef) => {
    if (k.action === "space") setQuery((q) => q + " ");
    else if (k.action === "del") setQuery((q) => q.slice(0, -1));
    else if (k.action === "clear") setQuery("");
    else if (k.action === "mode" && k.mode) {
      setMode(k.mode);
      // Layout changed (different row lengths) → land focus back on the first key.
      setFocus({ zone: "keyboard", row: 0, col: 0 });
    } else if (k.value) setQuery((q) => q + k.value);
  }, []);

  // ---- Key handling ------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const key = e.key;
      const isLeft = key === "ArrowLeft" || code === 37;
      const isUp = key === "ArrowUp" || code === 38;
      const isRight = key === "ArrowRight" || code === 39;
      const isDown = key === "ArrowDown" || code === 40;
      const isEnter = key === "Enter" || code === 13;
      const isBack = key === "Escape" || key === "Backspace" || code === 27 || code === 8;

      if (isBack) {
        e.preventDefault();
        router.push("/tv-home");
        return;
      }
      if (!isLeft && !isUp && !isRight && !isDown && !isEnter) return;
      e.preventDefault();

      setFocus((prev) => {
        // ---------------- KEYBOARD ZONE ----------------
        if (prev.zone === "keyboard") {
          let { row, col } = prev;
          row = Math.min(row, rows.length - 1);
          const rowLen = rows[row].length;
          col = Math.min(col, rowLen - 1);

          if (isEnter) {
            applyKey(rows[row][col]);
            return { zone: "keyboard", row, col };
          }
          if (isLeft) {
            col = Math.max(0, col - 1);
          } else if (isRight) {
            if (col < rowLen - 1) col = col + 1;
          } else if (isUp) {
            row = Math.max(0, row - 1);
            col = Math.min(col, rows[row].length - 1);
          } else if (isDown) {
            if (row < rows.length - 1) {
              row = row + 1;
              col = Math.min(col, rows[row].length - 1);
            } else if (results.length > 0) {
              // Past the last keyboard row → cross DOWN into the results grid.
              return { zone: "results", row: 0, col: 0 };
            }
          }
          return { zone: "keyboard", row, col };
        }

        // ---------------- RESULTS ZONE ----------------
        const count = results.length;
        if (count === 0) return { zone: "keyboard", row: 0, col: 0 };
        const lastRow = Math.floor((count - 1) / RESULTS_PER_ROW);
        let { row, col } = prev;

        if (isEnter) {
          open(results[row * RESULTS_PER_ROW + col]);
          return prev;
        }
        if (isLeft) {
          col = Math.max(0, col - 1);
        } else if (isRight) {
          const idx = row * RESULTS_PER_ROW + col;
          if (idx < count - 1 && col < RESULTS_PER_ROW - 1) col = col + 1;
        } else if (isUp) {
          if (row > 0) {
            row = row - 1;
          } else {
            // Top row of results → cross UP back into the keyboard above.
            const kbRow = rows.length - 1;
            return { zone: "keyboard", row: kbRow, col: Math.min(col, rows[kbRow].length - 1) };
          }
        } else if (isDown) {
          row = Math.min(lastRow, row + 1);
          const idx = row * RESULTS_PER_ROW + col;
          if (idx > count - 1) col = (count - 1) % RESULTS_PER_ROW;
        }
        return { zone: "results", row, col };
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [rows, results, applyKey, open, router]);

  // ---- Render ------------------------------------------------------------
  return (
    <main
      className="bg-background text-foreground select-none"
      // Экран фиксированной высоты, как на главной. Раньше страница просто
      // росла вниз, а прокручивать её на телевизоре нечем — из шестидесяти
      // найденных карточек за краями экрана оставались пятьдесят четыре, и
      // человек их не видел вовсе.
      style={{ background: "var(--background)", height: "100%", overflow: "hidden" }}
    >
      {/* Query display */}
      <header className="px-12 pt-[44px] pb-5">
        <div className="mb-2 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
          Поиск
        </div>
        <div
          className="flex min-h-[60px] items-center rounded-2xl bg-card px-6 text-3xl font-bold"
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        >
          {query ? (
            <span className="text-foreground">
              {query}
              <span className="ml-1 inline-block animate-pulse" style={{ color: "var(--primary)" }}>
                |
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Введите название…</span>
          )}
        </div>
      </header>

      <div
        className="px-12 pb-6"
        // КЛАВИАТУРА СЛЕВА, РЕЗУЛЬТАТЫ СПРАВА.
        //
        // Раньше клавиатура стояла сверху и съедала почти весь экран: области
        // результатов оставалось 188 точек из 720 — один ряд карточек. Человек
        // искал, находил шестьдесят наименований и видел из них четыре.
        //
        // В строку клавиатура занимает свою ширину, а результаты получают всю
        // высоту экрана. Раскладку задаём стилем, а не классами: на телевизорах
        // часть служебных классов не применяется.
        style={{
          height: "calc(100% - 150px)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "row",
          alignItems: "stretch",
        }}
      >
        {/* ---------------- On-screen keyboard (top) ---------------- */}
        <section
          aria-label="Экранная клавиатура"
          style={{ flexShrink: 0, marginRight: 32, overflowY: "auto" }}
        >
          <div className="flex flex-col gap-1.5">
            {rows.map((row, rIdx) => (
              <div key={rIdx} className="flex gap-1.5">
                {row.map((k, cIdx) => {
                  const focused = focus.zone === "keyboard" && focus.row === rIdx && focus.col === cIdx;
                  const isAction = !!k.action;
                  const isActiveMode = k.action === "mode" && k.mode === mode;
                  return (
                    <button
                      key={cIdx}
                      ref={(node) => {
                        if (!keyRefs.current[rIdx]) keyRefs.current[rIdx] = [];
                        keyRefs.current[rIdx][cIdx] = node;
                      }}
                      tabIndex={focused ? 0 : -1}
                      onClick={() => {
                        setFocus({ zone: "keyboard", row: rIdx, col: cIdx });
                        applyKey(k);
                      }}
                      onFocus={() => setFocus({ zone: "keyboard", row: rIdx, col: cIdx })}
                      className="flex items-center justify-center rounded-lg font-bold outline-none transition-transform duration-100 ease-out"
                      style={{
                        height: KEY,
                        flex: k.action === "space" ? "1 1 auto" : "0 0 auto",
                        width: isAction ? undefined : KEY,
                        minWidth: k.action === "space" ? 120 : isAction ? 64 : KEY,
                        padding: isAction ? "0 14px" : 0,
                        fontSize: isAction ? 18 : 24,
                        background: isActiveMode ? "var(--primary)" : "var(--card)",
                        color: isActiveMode ? "#0a0a0a" : "var(--foreground)",
                        transform: focused ? "scale(1.12)" : "scale(1)",
                        boxShadow: focused
                          ? "0 0 0 3px var(--primary), 0 8px 22px rgba(0,0,0,0.6)"
                          : "0 2px 6px rgba(0,0,0,0.4)",
                      }}
                    >
                      {k.action === "del" ? <IconBackspace size={22} /> : k.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-5 text-sm text-muted-foreground">Выход — стрелка влево от клавиатуры</p>
        </section>

        {/* ---------------- Results ---------------- */}
        <section
          className="min-w-0"
          aria-label="Результаты поиска"
          // Прокручивается ТОЛЬКО эта область — не вся страница.
          style={{ flex: "1 1 0%", minWidth: 0, minHeight: 0, overflowY: "auto" }}
        >
          {loading ? (
            <div className="flex h-[60vh] items-center justify-center text-2xl font-semibold text-muted-foreground">
              Поиск…
            </div>
          ) : results.length > 0 ? (
            <div
              className="pr-4"
              // БЕЗ сеточной раскладки.
              //
              // Сетка (display:grid) есть не на всех телевизорах, а когда её нет,
              // каждая карточка растягивается на всю ширину — Егор так и описал:
              // «карточки на весь экран». Отступы между ячейками (gap) там тоже
              // не работают.
              //
              // Поэтому раскладываем карточки строчными блоками с долей ширины:
              // это понимает любой движок с 2000-х. Отступы — обычными полями
              // внутри ячейки.
              style={{ fontSize: 0 }}
            >
              {results.map((card, idx) => {
                const row = Math.floor(idx / RESULTS_PER_ROW);
                const col = idx % RESULTS_PER_ROW;
                const focused = focus.zone === "results" && focus.row === row && focus.col === col;
                const isTv = card.mt === "tv";
                return (
                  <button
                    key={card.key}
                    ref={(node) => {
                      resultRefs.current[idx] = node;
                    }}
                    tabIndex={focused ? 0 : -1}
                    onClick={() => {
                      setFocus({ zone: "results", row, col });
                      open(card);
                    }}
                    onFocus={() => setFocus({ zone: "results", row, col })}
                    className="group rounded-xl text-left outline-none transition-transform duration-150 ease-out"
                    style={{
                      display: "inline-block",
                      verticalAlign: "top",
                      width: `${100 / RESULTS_PER_ROW}%`,
                      paddingLeft: 8,
                      paddingRight: 8,
                      paddingBottom: 18,
                      boxSizing: "border-box",
                      fontSize: 14, // возвращаем размер: у контейнера он обнулён
                      transform: focused ? "scale(1.06)" : "scale(1)",
                    }}
                  >
                    <div
                      className="relative overflow-hidden rounded-xl bg-card"
                      // Пропорции постера держим отступом снизу в процентах от
                      // ШИРИНЫ (150% = 2:3), а не свойством aspect-ratio: его
                      // телевизоры не знают (оно с Chrome 88), и карточка у них
                      // схлопывалась. Приём старый и понятен любому движку.
                      style={{
                        width: "100%",
                        paddingBottom: "150%",
                        boxShadow: focused
                          ? "0 0 0 4px var(--primary), 0 16px 40px rgba(0,0,0,0.6)"
                          : "0 4px 16px rgba(0,0,0,0.4)",
                      }}
                    >
                      {card.poster ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={card.poster}
                          alt={card.title}
                          loading="lazy"
                          draggable={false}
                          className="object-cover"
                          // Растягиваем по четырём краям: родитель задаёт
                          // пропорции отступом, поэтому «сто процентов высоты»
                          // здесь не сработало бы.
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-center px-3 text-center text-base font-semibold text-muted-foreground"
                          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
                        >
                          {card.title}
                        </div>
                      )}

                      {/* Type badge — distinguishes Фильм vs Сериал at a glance */}
                      <span
                        className="absolute left-1.5 top-1.5 rounded px-1.5 py-0.5 text-[12px] font-bold uppercase tracking-wide"
                        style={{
                          background: isTv ? "rgba(56,189,248,0.92)" : "rgba(0,0,0,0.72)",
                          color: isTv ? "#06283d" : "#fff",
                          backdropFilter: "blur(2px)",
                        }}
                      >
                        {isTv ? "Сериал" : "Фильм"}
                      </span>

                    </div>

                    {/* Название ПОД постером. Поверх картинки оно налезало на
                        изображение и обрезалось до «Холод в…». */}
                    <div style={{ marginTop: 8, paddingLeft: 2, paddingRight: 2 }}>
                      <p
                        className="text-sm font-semibold leading-tight"
                        style={{
                          color: focused ? "var(--primary)" : "#fff",
                          // Две строки максимум, без современных свойств:
                          // фиксированная высота и скрытие лишнего.
                          height: 34,
                          overflow: "hidden",
                        }}
                        title={card.title}
                      >
                        {card.title}
                      </p>
                      {card.year && (
                        <p className="text-xs" style={{ color: "#a1a1aa" }}>{card.year}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : searched ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <p className="text-3xl font-bold text-foreground">Ничего не найдено</p>
              <p className="mt-3 text-lg text-muted-foreground">Попробуйте изменить запрос</p>
            </div>
          ) : (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <p className="text-3xl font-bold text-foreground">Введите название</p>
              <p className="mt-3 text-lg text-muted-foreground">
                Наберите минимум 2 символа на клавиатуре слева
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
