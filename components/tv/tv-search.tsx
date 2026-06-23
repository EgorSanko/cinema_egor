"use client";

import { fetchMoviesBySearchAction, fetchTVBySearchAction } from "@/app/actions";
import { getImageUrl } from "@/lib/tmdb";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

// Card shape mirrors /tv-home exactly so results look identical.
type TvCard = {
  id: number;
  type: "movie" | "tv";
  title: string;
  year: string;
  poster: string;
};

// ---------------------------------------------------------------------------
// On-screen D-pad keyboard layout.
// Each inner array is one row; keys within a row are navigated Left/Right,
// rows are navigated Up/Down. The last row is the "actions" row.
// ---------------------------------------------------------------------------
type KeyDef = { label: string; value?: string; action?: "space" | "del" | "clear" };

const ROW = (s: string): KeyDef[] => s.split("").map((c) => ({ label: c, value: c }));

const KEY_ROWS: KeyDef[][] = [
  ROW("АБВГДЕЁЖ"),
  ROW("ЗИЙКЛМНО"),
  ROW("ПРСТУФХЦ"),
  ROW("ЧШЩЪЫЬЭЮ"),
  ROW("ЯABCDEFG"),
  ROW("HIJKLMNO"),
  ROW("PQRSTUVW"),
  ROW("XYZ01234"),
  ROW("56789"),
  [
    { label: "Пробел", action: "space" },
    { label: "⌫ Стереть", action: "del" },
    { label: "Очистить", action: "clear" },
  ],
];

const CARD_W = 200; // px — a touch smaller than home so the rail fits beside the keyboard.
const RESULTS_PER_ROW = 4;

/**
 * TV "10-foot UI" search. Fully D-pad / keyboard driven, no mouse, no TextInput.
 *
 * Focus model — single source of truth in React state:
 *   focus = { zone, row, col }
 *     - zone "keyboard": (row, col) index into KEY_ROWS.
 *     - zone "results":  (row, col) index into a RESULTS_PER_ROW grid of cards.
 *
 * Navigation:
 *   - Inside the keyboard, Left/Right clamp within a row, Up/Down change row
 *     (col clamped to the new row's length).
 *   - Pressing Right on the LAST column of a keyboard row crosses into the
 *     results zone (if there are results). Pressing Left on the FIRST column
 *     of a results row crosses back to the keyboard.
 *   - Inside results, Up/Down move a full row of RESULTS_PER_ROW.
 *   - OK/Enter: on a keyboard key it appends a char / runs the action; on a
 *     result card it opens /tv-watch/{type}/{id}.
 *   - Escape / Backspace (key OR keyCode 27/8) -> back to /tv-home.
 *
 * Both e.key AND e.keyCode are handled because real TV remotes can send
 * legacy keyCodes (37/38/39/40 arrows, 13 Enter, 8 back, 27 escape) and some
 * fire keyCode 0 alongside key "Enter".
 */
export function TvSearch() {
  const router = useRouter();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TvCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // focus: which zone + grid cell currently has focus.
  const [focus, setFocus] = useState<{ zone: "keyboard" | "results"; row: number; col: number }>({
    zone: "keyboard",
    row: 0,
    col: 0,
  });

  // Imperative DOM refs so we can call .focus()/.scrollIntoView() on move.
  const keyRefs = useRef<(HTMLButtonElement | null)[][]>([]);
  const resultRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const open = useCallback(
    (card: TvCard | undefined) => {
      if (!card) return;
      router.push(`/tv-watch/${card.type}/${card.id}`);
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
        const [movies, tvShows] = await Promise.all([
          fetchMoviesBySearchAction(q, 1),
          fetchTVBySearchAction(q, 1),
        ]);
        if (cancelled) return;
        const movieCards: TvCard[] = (movies || []).map((m: any) => ({
          id: m.id,
          type: "movie" as const,
          title: m.title,
          year: m.release_date ? String(m.release_date).slice(0, 4) : "",
          poster: getImageUrl(m.poster_path, "w500"),
        }));
        const tvCards: TvCard[] = (tvShows || []).map((t: any) => ({
          id: t.id,
          type: "tv" as const,
          title: t.name,
          year: t.first_air_date ? String(t.first_air_date).slice(0, 4) : "",
          poster: getImageUrl(t.poster_path, "w500"),
        }));
        // Interleave-ish: movies first, then series (mirrors the navbar).
        setResults([...movieCards, ...tvCards].slice(0, 40));
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

  // If results shrink/disappear while focus is in the results zone, pull
  // focus back onto the keyboard so it never lands on a missing card.
  useEffect(() => {
    setFocus((prev) => {
      if (prev.zone !== "results") return prev;
      if (results.length === 0) return { zone: "keyboard", row: prev.row, col: 0 };
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
  }, [focus, results.length]);

  // Focus the very first key on mount.
  useEffect(() => {
    keyRefs.current[0]?.[0]?.focus({ preventScroll: true });
  }, []);

  // ---- Key handling ------------------------------------------------------
  const applyKey = useCallback((k: KeyDef) => {
    if (k.action === "space") setQuery((q) => q + " ");
    else if (k.action === "del") setQuery((q) => q.slice(0, -1));
    else if (k.action === "clear") setQuery("");
    else if (k.value) setQuery((q) => q + k.value);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const key = e.key;

      const isLeft = key === "ArrowLeft" || code === 37;
      const isUp = key === "ArrowUp" || code === 38;
      const isRight = key === "ArrowRight" || code === 39;
      const isDown = key === "ArrowDown" || code === 40;
      const isEnter = key === "Enter" || code === 13;
      // Back: Escape (27) or Backspace (8). Real remotes send the BACK button
      // as one of these in an Android TV WebView.
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
          const rowLen = KEY_ROWS[row].length;

          if (isEnter) {
            applyKey(KEY_ROWS[row][col]);
            return prev;
          }
          if (isLeft) {
            col = Math.max(0, col - 1);
          } else if (isRight) {
            if (col < rowLen - 1) {
              col = col + 1;
            } else if (results.length > 0) {
              // Cross into results from the right edge.
              return { zone: "results", row: 0, col: 0 };
            }
          } else if (isUp) {
            row = Math.max(0, row - 1);
            col = Math.min(col, KEY_ROWS[row].length - 1);
          } else if (isDown) {
            row = Math.min(KEY_ROWS.length - 1, row + 1);
            col = Math.min(col, KEY_ROWS[row].length - 1);
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
          if (col > 0) {
            col = col - 1;
          } else {
            // Cross back to the keyboard from the left edge.
            return { zone: "keyboard", row: Math.min(prev.row, KEY_ROWS.length - 1), col: KEY_ROWS[Math.min(prev.row, KEY_ROWS.length - 1)].length - 1 };
          }
        } else if (isRight) {
          const idx = row * RESULTS_PER_ROW + col;
          if (idx < count - 1 && col < RESULTS_PER_ROW - 1) col = col + 1;
        } else if (isUp) {
          row = Math.max(0, row - 1);
        } else if (isDown) {
          row = Math.min(lastRow, row + 1);
          // Clamp col so we don't land past the last (possibly partial) row.
          const idx = row * RESULTS_PER_ROW + col;
          if (idx > count - 1) col = (count - 1) % RESULTS_PER_ROW;
        }
        return { zone: "results", row, col };
      });
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [results, applyKey, open, router]);

  // ---- Render ------------------------------------------------------------
  return (
    <main
      className="min-h-screen bg-background text-foreground select-none"
      style={{ background: "var(--background)" }}
    >
      {/* Query display — prominent, full width across the top */}
      <header className="px-12 pt-10 pb-6">
        <div className="mb-2 text-base font-semibold uppercase tracking-widest text-muted-foreground">
          Поиск
        </div>
        <div
          className="flex min-h-[72px] items-center rounded-2xl bg-card px-6 text-4xl font-bold"
          style={{ boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}
        >
          {query ? (
            <span className="text-foreground">
              {query}
              <span
                className="ml-1 inline-block animate-pulse"
                style={{ color: "var(--primary)" }}
              >
                |
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Введите название…</span>
          )}
        </div>
      </header>

      {/* Two-column layout: keyboard (left) | results (right) */}
      <div className="flex gap-10 px-12 pb-24">
        {/* ---------------- On-screen keyboard ---------------- */}
        <section
          className="shrink-0"
          style={{ width: 560 }}
          aria-label="Экранная клавиатура"
        >
          <div className="flex flex-col gap-3">
            {KEY_ROWS.map((row, rIdx) => (
              <div key={rIdx} className="flex gap-3">
                {row.map((k, cIdx) => {
                  const focused =
                    focus.zone === "keyboard" && focus.row === rIdx && focus.col === cIdx;
                  const isAction = !!k.action;
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
                      className="flex items-center justify-center rounded-xl bg-card font-bold outline-none transition-transform duration-100 ease-out"
                      style={{
                        height: 60,
                        flex: isAction ? "1 1 auto" : "0 0 60px",
                        minWidth: isAction ? 120 : 60,
                        padding: isAction ? "0 18px" : 0,
                        fontSize: isAction ? 22 : 28,
                        color: "var(--foreground)",
                        transform: focused ? "scale(1.10)" : "scale(1)",
                        boxShadow: focused
                          ? "0 0 0 4px var(--primary), 0 10px 28px rgba(0,0,0,0.6)"
                          : "0 2px 8px rgba(0,0,0,0.4)",
                      }}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-6 text-base text-muted-foreground">
            Назад — кнопка «Back» на пульте
          </p>
        </section>

        {/* ---------------- Results ---------------- */}
        <section className="flex-1 min-w-0" aria-label="Результаты поиска">
          {loading ? (
            <div className="flex h-[60vh] items-center justify-center text-3xl font-semibold text-muted-foreground">
              Поиск…
            </div>
          ) : results.length > 0 ? (
            <div
              className="grid gap-6"
              style={{ gridTemplateColumns: `repeat(${RESULTS_PER_ROW}, ${CARD_W}px)` }}
            >
              {results.map((card, idx) => {
                const row = Math.floor(idx / RESULTS_PER_ROW);
                const col = idx % RESULTS_PER_ROW;
                const focused =
                  focus.zone === "results" && focus.row === row && focus.col === col;
                return (
                  <button
                    key={`${card.type}-${card.id}`}
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
                    <div className="mt-3 px-1">
                      <p
                        className="truncate text-xl font-semibold text-foreground"
                        title={card.title}
                      >
                        {card.title}
                      </p>
                      <p className="text-base text-muted-foreground">{card.year}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : searched ? (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <p className="text-4xl font-bold text-foreground">Ничего не найдено</p>
              <p className="mt-3 text-xl text-muted-foreground">
                Попробуйте изменить запрос
              </p>
            </div>
          ) : (
            <div className="flex h-[60vh] flex-col items-center justify-center text-center">
              <p className="text-4xl font-bold text-foreground">Введите название</p>
              <p className="mt-3 text-xl text-muted-foreground">
                Наберите минимум 2 символа на клавиатуре слева
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
