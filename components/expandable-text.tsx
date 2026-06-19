"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface Props {
  text: string;
  className?: string;
  /** Tailwind clamp class used in the collapsed state. */
  clampClass?: string;
  /** Min length before the toggle is offered (short synopses don't need it). */
  threshold?: number;
}

/** Collapsible synopsis — fixes ticket "плашка для открывания ПОЛНОГО описания".
    Shows a clamped preview + «Показать полностью» / «Свернуть» toggle. */
export function ExpandableText({ text, className = "", clampClass = "line-clamp-2", threshold = 140 }: Props) {
  const [open, setOpen] = useState(false);
  const long = text.length > threshold;

  return (
    <div className="max-w-2xl">
      <p className={`${className} ${open || !long ? "" : clampClass}`}>{text}</p>
      {long && (
        <button
          onClick={() => setOpen(o => !o)}
          className="mt-1.5 inline-flex items-center gap-1 text-foreground/55 hover:text-foreground text-[12.5px] font-medium transition-colors"
          aria-expanded={open}
        >
          {open ? "Свернуть" : "Показать полностью"}
          <ChevronDown size={14} className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}
