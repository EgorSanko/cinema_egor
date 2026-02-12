"use client";

import { useState } from "react";
import { Check } from "lucide-react";

interface GenrePickerProps {
  playerName: string;
  onSubmit: (genres: number[]) => void;
  loading?: boolean;
}

const GENRES = [
  { id: 28, name: "Экшн", emoji: "💥" },
  { id: 12, name: "Приключения", emoji: "🗺️" },
  { id: 16, name: "Анимация", emoji: "🎨" },
  { id: 35, name: "Комедия", emoji: "😂" },
  { id: 80, name: "Криминал", emoji: "🔪" },
  { id: 99, name: "Документальный", emoji: "📹" },
  { id: 18, name: "Драма", emoji: "🎭" },
  { id: 10751, name: "Семейный", emoji: "👨‍👩‍👧" },
  { id: 14, name: "Фэнтези", emoji: "🧙" },
  { id: 36, name: "Исторический", emoji: "📜" },
  { id: 27, name: "Ужасы", emoji: "👻" },
  { id: 10402, name: "Музыка", emoji: "🎵" },
  { id: 9648, name: "Детектив", emoji: "🔍" },
  { id: 10749, name: "Мелодрама", emoji: "💕" },
  { id: 878, name: "Фантастика", emoji: "🚀" },
  { id: 53, name: "Триллер", emoji: "😰" },
  { id: 10752, name: "Военный", emoji: "⚔️" },
  { id: 37, name: "Вестерн", emoji: "🤠" },
];

export function GenrePicker({ playerName, onSubmit, loading }: GenrePickerProps) {
  const [selected, setSelected] = useState<number[]>([]);

  const toggle = (id: number) => {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-foreground mb-2">{playerName}, выберите жанры</h2>
        <p className="text-muted-foreground">Какие жанры вам нравятся? Выберите хотя бы 2</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        {GENRES.map(genre => {
          const isSelected = selected.includes(genre.id);
          return (
            <button key={genre.id} onClick={() => toggle(genre.id)}
              className={`flex items-center gap-2.5 p-3.5 rounded-xl border-2 transition-all text-left ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-lg shadow-primary/10"
                  : "border-border bg-card hover:border-primary/30"
              }`}>
              <span className="text-xl">{genre.emoji}</span>
              <span className={`text-sm font-medium ${isSelected ? "text-primary" : "text-foreground"}`}>
                {genre.name}
              </span>
              {isSelected && (
                <Check size={16} className="text-primary ml-auto" />
              )}
            </button>
          );
        })}
      </div>

      <div className="sticky bottom-20 sm:bottom-4 pt-4">
        <button onClick={() => onSubmit(selected)}
          disabled={selected.length < 2 || loading}
          className="w-full py-3.5 bg-primary hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-lg transition-colors">
          {loading ? "Загрузка..." : `Готово (${selected.length} выбрано)`}
        </button>
        {selected.length < 2 && (
          <p className="text-center text-muted-foreground text-xs mt-2">Выберите хотя бы 2 жанра</p>
        )}
      </div>
    </div>
  );
}
