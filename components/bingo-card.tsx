"use client";

import { useState, useEffect, useMemo } from "react";
import { X, Trophy } from "lucide-react";

/**
 * Cinema Bingo — 4×4 grid of tropes. User checks them off as they
 * appear in the movie/episode. Filling a full row/column/diagonal
 * is a "Bingo", filling the whole card triggers an achievement.
 *
 * Trope pool is shuffled per movie session (seeded by media id so it's
 * stable if user reopens the same title). Persisted to localStorage
 * keyed by `${type}-${id}` so users can resume.
 */

const TROPE_POOL: string[] = [
  "Главный герой просыпается утром",
  "Затяжная сцена погони",
  "Поцелуй под дождём",
  "Кофе разлили на бумаги",
  "Кадр глаз крупным планом",
  "Кто-то умирает на руках",
  "Слоумо со взрывом сзади",
  "Звонок не вовремя",
  "Драка в баре",
  "Twist раскрывается в туалете",
  "Главный плохой герой шепчет",
  "Сцена с зеркалом",
  "Прыжок с крыши",
  "Дверь захлопывается перед носом",
  "Любовники под одеялом",
  "Кадр сверху на город",
  "Старик даёт мудрый совет",
  "Скрытая флешка / диск",
  "Кто-то падает в воду",
  "Звучит классическая музыка во время насилия",
  "Финальная драка под дождём",
  "Главный герой блюёт в кустах",
  "Объяснение схемы у доски",
  "Главный антагонист — лучший друг",
  "Сцена без диалогов в начале",
  "Лиричный монолог в кадре",
  "Машина не заводится в нужный момент",
  "Бомба тикает 0:00:03",
  "Героиня бежит на каблуках",
  "Камера дрожит при стрельбе",
  "Молчаливый эпизод в финале",
  "Чёрный экран → титры",
];

const STORAGE_PREFIX = "kino_bingo_v1_";

function shuffleSeeded(arr: string[], seed: number): string[] {
  // Mulberry32 — deterministic PRNG
  let t = seed + 0x6D2B79F5;
  const rng = () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function loadChecked(key: string): boolean[] {
  if (typeof window === "undefined") return Array(16).fill(false);
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return Array(16).fill(false);
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length === 16) return arr;
  } catch {}
  return Array(16).fill(false);
}

function saveChecked(key: string, checked: boolean[]) {
  try { localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(checked)); } catch {}
}

export function BingoCard({ mediaId, mediaType, onClose }: { mediaId: number; mediaType: "movie" | "tv"; onClose: () => void }) {
  const key = `${mediaType}-${mediaId}`;
  const tropes = useMemo(() => shuffleSeeded(TROPE_POOL, mediaId).slice(0, 16), [mediaId]);
  const [checked, setChecked] = useState<boolean[]>(() => loadChecked(key));
  const [justWon, setJustWon] = useState(false);

  useEffect(() => { saveChecked(key, checked); }, [key, checked]);

  // Bingo detection — any row/col/diag fully checked
  const wonLines = useMemo(() => {
    const lines: number[][] = [];
    for (let r = 0; r < 4; r++) lines.push([r * 4, r * 4 + 1, r * 4 + 2, r * 4 + 3]);
    for (let c = 0; c < 4; c++) lines.push([c, c + 4, c + 8, c + 12]);
    lines.push([0, 5, 10, 15]);
    lines.push([3, 6, 9, 12]);
    return lines.filter(l => l.every(i => checked[i]));
  }, [checked]);

  const allChecked = checked.every(Boolean);

  useEffect(() => {
    if (allChecked && !justWon) {
      setJustWon(true);
      try { window.dispatchEvent(new CustomEvent("bingo-full", { detail: { mediaId, mediaType } })); } catch {}
    }
  }, [allChecked, justWon, mediaId, mediaType]);

  const toggle = (i: number) => {
    setChecked(prev => prev.map((v, idx) => idx === i ? !v : v));
  };
  const reset = () => {
    setChecked(Array(16).fill(false));
    setJustWon(false);
  };

  const winningCells = new Set(wonLines.flat());

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 bg-black/85 backdrop-blur-sm" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="relative w-full max-w-md rounded-2xl bg-background ring-1 ring-white/10 flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between p-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🎲</span>
            <div>
              <h2 className="text-foreground text-base font-bold leading-tight">Кино-бинго</h2>
              <p className="text-foreground/55 text-[11px]">Отмечай тропы по ходу фильма</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 flex items-center justify-center"><X size={14} /></button>
        </div>

        {allChecked && (
          <div className="px-4 py-2.5 bg-gradient-to-r from-yellow-400/20 to-amber-500/15 border-b border-yellow-400/30 flex items-center gap-2">
            <Trophy size={14} className="text-yellow-300" />
            <span className="text-yellow-200 text-[12px] font-bold">BLACKOUT! Все 16 закрыты — ты внимательный кинокритик</span>
          </div>
        )}
        {!allChecked && wonLines.length > 0 && (
          <div className="px-4 py-2 bg-primary/10 border-b border-primary/20">
            <span className="text-primary text-[12px] font-bold">БИНГО! {wonLines.length} {wonLines.length === 1 ? "линия" : "линии"} закрыто</span>
          </div>
        )}

        <div className="p-3 grid grid-cols-4 gap-1.5 overflow-y-auto">
          {tropes.map((t, i) => {
            const isChecked = checked[i];
            const inWin = winningCells.has(i);
            return (
              <button
                key={i}
                onClick={() => toggle(i)}
                className={`aspect-square rounded-lg p-1.5 text-[8.5px] font-medium leading-tight transition-all ${
                  isChecked
                    ? inWin
                      ? "bg-yellow-400/25 ring-1 ring-yellow-400/50 text-yellow-100"
                      : "bg-primary/20 ring-1 ring-primary/40 text-primary-foreground/90"
                    : "bg-foreground/[0.04] ring-1 ring-white/[0.06] text-foreground/70 hover:bg-foreground/[0.08]"
                }`}
                style={inWin ? { boxShadow: "0 0 12px rgba(250,204,21,0.30)" } : undefined}
              >
                {isChecked && <div className="text-base mb-0.5">✓</div>}
                {t}
              </button>
            );
          })}
        </div>

        <div className="p-3 border-t border-white/[0.06] flex justify-between items-center">
          <span className="text-foreground/45 text-[11px]">{checked.filter(Boolean).length} / 16</span>
          <button onClick={reset} className="px-3 h-8 rounded-full bg-foreground/[0.05] hover:bg-foreground/[0.10] text-foreground/75 text-[11px] font-medium">Сбросить</button>
        </div>
      </div>
    </div>
  );
}
