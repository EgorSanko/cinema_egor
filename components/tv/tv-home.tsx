"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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
const CARD_W = 240; // px

/**
 * TV "10-foot UI" home. Fully D-pad / keyboard driven.
 *
 * Navigation model:
 *  - focus = { rail, index } held in React state (single source of truth).
 *  - A window 'keydown' handler mutates focus; we never rely on the browser's
 *    built-in spatial navigation (unreliable in Android TV WebView).
 *  - Arrow Left/Right clamp within the current rail.
 *  - Arrow Up/Down change rail, keeping the same column index (clamped to the
 *    new rail's length).
 *  - Enter opens the focused card -> /movie/{id} or /tv/{id}.
 *  - Backspace / Escape: no-op here (let WebView/back button handle it).
 *  - Both e.key AND e.keyCode are handled, because real TV remotes can send
 *    legacy keyCodes (37/38/39/40 arrows, 13 Enter) and some fire keyCode 0
 *    with key 'Enter'.
 */
export function TvHome({ rails }: { rails: TvRail[] }) {
  const router = useRouter();
  const [focus, setFocus] = useState({ rail: 0, index: 0 });

  // Ref grid of the actual focusable card elements, so we can call
  // .focus() + scrollIntoView() imperatively whenever focus state changes.
  const cardRefs = useRef<(HTMLButtonElement | null)[][]>([]);

  const open = useCallback(
    (card: TvCard | undefined) => {
      if (!card) return;
      router.push(`/${card.type}/${card.id}`);
    },
    [router]
  );

  // Drive real DOM focus + smooth-scroll from the focus state.
  useEffect(() => {
    const el = cardRefs.current[focus.rail]?.[focus.index];
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ behavior: "smooth", inline: "center", block: "center" });
  }, [focus]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const code = e.keyCode;
      const key = e.key;

      const isLeft = key === "ArrowLeft" || code === 37;
      const isUp = key === "ArrowUp" || code === 38;
      const isRight = key === "ArrowRight" || code === 39;
      const isDown = key === "ArrowDown" || code === 40;
      // Some TVs send keyCode 0 alongside key === "Enter".
      const isEnter = key === "Enter" || code === 13;

      if (!isLeft && !isUp && !isRight && !isDown && !isEnter) return;
      e.preventDefault();

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
  }, [rails, open]);

  // Focus the very first card on mount.
  useEffect(() => {
    const el = cardRefs.current[0]?.[0];
    if (el) el.focus({ preventScroll: true });
  }, []);

  return (
    <main
      className="min-h-screen bg-background text-foreground select-none"
      style={{ background: "var(--background)" }}
    >
      {/* Top bar — brand logo (lime glow, matches the site header) */}
      <header className="px-12 pt-10 pb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo.png"
          alt="SAPKEFLY KINO"
          draggable={false}
          className="h-16 w-auto"
          style={{ filter: "drop-shadow(0 0 22px rgba(163,230,53,0.45))" }}
        />
      </header>

      {/* Vertical stack of rails */}
      <div className="flex flex-col gap-12 pb-24">
        {rails.map((rail, rIdx) => (
          <section key={rail.title}>
            <h2 className="px-12 mb-4 text-3xl font-bold text-foreground">
              {rail.title}
            </h2>
            <div
              className="flex gap-6 overflow-x-auto px-12 pb-2"
              style={{ scrollbarWidth: "none" }}
            >
              {rail.cards.map((card, cIdx) => {
                const focused =
                  focus.rail === rIdx && focus.index === cIdx;
                return (
                  <button
                    key={card.id}
                    ref={(node) => {
                      if (!cardRefs.current[rIdx]) cardRefs.current[rIdx] = [];
                      cardRefs.current[rIdx][cIdx] = node;
                    }}
                    tabIndex={focused ? 0 : -1}
                    onClick={() => {
                      setFocus({ rail: rIdx, index: cIdx });
                      open(card);
                    }}
                    onFocus={() => setFocus({ rail: rIdx, index: cIdx })}
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
                    <div className="mt-3 px-1">
                      <p
                        className="truncate text-xl font-semibold text-foreground"
                        title={card.title}
                      >
                        {card.title}
                      </p>
                      <p className="text-base text-muted-foreground">
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
