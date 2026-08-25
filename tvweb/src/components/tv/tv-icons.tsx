import * as React from "react";

/**
 * ТВ-набор иконок (10-foot UI). Единый стиль: 24-viewBox, currentColor,
 * скруглённые концы. Заливочные (Play/Pause) читаются лучше на большом экране,
 * остальные — обводка stroke=2. Размер задаётся пропом `size`.
 *
 * Заменяет эмодзи-глифы (⏪⏯⏩⚙✕ ⌫⇧⇄ ◀▶▲▼), которые на разных ТВ-браузерах
 * рендерились цветными эмодзи и выглядели несерьёзно.
 */
type P = { size?: number; className?: string; style?: React.CSSProperties };

function svg(size: number, children: React.ReactNode, extra?: P) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={extra?.className}
      style={extra?.style}
    >
      {children}
    </svg>
  );
}

export function IconPlay({ size = 24, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
    </svg>
  );
}

export function IconPause({ size = 24, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false" className={className} style={style}>
      <rect x="6" y="5" width="4" height="14" rx="1.2" />
      <rect x="14" y="5" width="4" height="14" rx="1.2" />
    </svg>
  );
}

/** Перемотка назад на 10с — стрелка-петля с «10». */
export function IconRewind10({ size = 24, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M11 8H6.5a5.5 5.5 0 1 0 5.5 5.5" />
      <path d="M9 5 6 8l3 3" />
      <text x="12.3" y="16" fontSize="8" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">10</text>
    </svg>
  );
}

/** Перемотка вперёд на 10с — зеркально. */
export function IconForward10({ size = 24, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" className={className} style={style}>
      <path d="M13 8h4.5a5.5 5.5 0 1 1-5.5 5.5" />
      <path d="M15 5l3 3-3 3" />
      <text x="11.5" y="16" fontSize="8" fontWeight="700" fill="currentColor" stroke="none" textAnchor="middle">10</text>
    </svg>
  );
}

export function IconSettings({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
    </>
  ), { className, style });
}

export function IconClose({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </>
  ), { className, style });
}

export function IconSearch({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </>
  ), { className, style });
}

export function IconTrophy({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <path d="M8 21h8" />
      <path d="M12 17v4" />
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3" />
      <path d="M7 5H4v2a3 3 0 0 0 3 3" />
    </>
  ), { className, style });
}

export function IconLogout({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H3" />
    </>
  ), { className, style });
}

export function IconBackspace({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <path d="M21 5H8.5a2 2 0 0 0-1.5.7l-4.2 5a2 2 0 0 0 0 2.6l4.2 5a2 2 0 0 0 1.5.7H21a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2Z" />
      <path d="M17 9.5l-5 5" />
      <path d="M12 9.5l5 5" />
    </>
  ), { className, style });
}

export function IconShift({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <path d="M12 3.5 4 12h4v6h8v-6h4L12 3.5Z" />
    </>
  ), { className, style });
}

/** Смена раскладки RU/EN. */
export function IconGlobe({ size = 24, className, style }: P) {
  return svg(size, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.5 3.8 5.7 3.8 9s-1.3 6.5-3.8 9c-2.5-2.5-3.8-5.7-3.8-9S9.5 5.5 12 3Z" />
    </>
  ), { className, style });
}

export function IconChevronLeft({ size = 24, className, style }: P) {
  return svg(size, <path d="M15 6l-6 6 6 6" />, { className, style });
}
export function IconChevronRight({ size = 24, className, style }: P) {
  return svg(size, <path d="M9 6l6 6-6 6" />, { className, style });
}
export function IconChevronUp({ size = 24, className, style }: P) {
  return svg(size, <path d="M6 15l6-6 6 6" />, { className, style });
}
export function IconChevronDown({ size = 24, className, style }: P) {
  return svg(size, <path d="M6 9l6 6 6-6" />, { className, style });
}
export function IconCheck({ size = 24, className, style }: P) {
  return svg(size, <path d="M5 12.5l4.5 4.5L19 6.5" />, { className, style });
}

/** «OK» на пульте — круглая кнопка. */
export function IconOk({ size = 24, className, style }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true" focusable="false" className={className} style={style}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Строчка-подсказка «иконка + текст» для нижних хинт-баров. Заменяет
 * "◀▶ перемотка · ▼ кнопки · OK пауза · ↩ скрыть" на чипы с иконками.
 */
export function Hint({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className="inline-flex items-center text-foreground/70">{icon}</span>
      <span>{children}</span>
    </span>
  );
}

export function HintRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={"flex items-center justify-center gap-x-6 gap-y-1 flex-wrap text-sm text-muted-foreground/60 " + (className || "")}>
      {children}
    </div>
  );
}
