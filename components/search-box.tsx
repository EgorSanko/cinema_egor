"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock } from "lucide-react";

/**
 * Поле поиска на самой странице /search.
 *
 * Раньше поиск на телефоне жил только внутри бургер-меню: чтобы что-то найти,
 * нужно было нажать три полоски и искать поиск там. Теперь в нижней панели
 * есть отдельная кнопка, а она ведёт сюда — и поле должно быть прямо здесь,
 * иначе человек попадёт на пустую страницу без единого способа ввести запрос.
 *
 * История запросов — тот же ключ, что у поиска в шапке: списки не должны
 * расходиться в зависимости от того, откуда искали.
 */
const КЛЮЧ_ИСТОРИИ = "kino_search_history";

export function SearchBox({ начальный = "" }: { начальный?: string }) {
  const router = useRouter();
  const [текст, setТекст] = useState(начальный);
  const [история, setИстория] = useState<string[]>([]);
  const полеРеф = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try { setИстория(JSON.parse(localStorage.getItem(КЛЮЧ_ИСТОРИИ) || "[]")); } catch {}
    // Пустой запрос — человек пришёл именно искать, ставим курсор сразу.
    // С готовым запросом не перехватываем фокус: он пришёл смотреть результаты.
    if (!начальный) setTimeout(() => полеРеф.current?.focus(), 60);
  }, [начальный]);

  const запомнить = (q: string) => {
    try {
      let h = JSON.parse(localStorage.getItem(КЛЮЧ_ИСТОРИИ) || "[]") as string[];
      h = [q, ...h.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
      localStorage.setItem(КЛЮЧ_ИСТОРИИ, JSON.stringify(h));
      setИстория(h);
    } catch {}
  };

  const искать = (q: string) => {
    const запрос = q.trim();
    if (!запрос) return;
    запомнить(запрос);
    router.push(`/search?q=${encodeURIComponent(запрос)}`);
  };

  return (
    <div className="mb-8">
      <form
        onSubmit={(e) => { e.preventDefault(); искать(текст); }}
        className="relative"
      >
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
        <input
          ref={полеРеф}
          value={текст}
          onChange={(e) => setТекст(e.target.value)}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          placeholder="Фильм, сериал или актёр"
          aria-label="Поиск"
          className="w-full h-12 pl-11 pr-11 rounded-full bg-white/[0.05] border border-white/[0.10] text-foreground placeholder:text-muted-foreground/70 text-[15px] outline-none focus:border-primary/50 focus:bg-white/[0.07] transition-colors"
        />
        {текст && (
          <button
            type="button"
            onClick={() => { setТекст(""); полеРеф.current?.focus(); }}
            aria-label="Очистить"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        )}
      </form>

      {!начальный && история.length > 0 && (
        <div className="mt-5">
          <div className="flex items-center gap-1.5 text-muted-foreground/70 text-[12px] font-semibold uppercase tracking-wider mb-2.5">
            <Clock size={13} />
            Недавние
          </div>
          <div className="flex flex-wrap gap-2">
            {история.map((з) => (
              <button
                key={з}
                type="button"
                onClick={() => { setТекст(з); искать(з); }}
                className="px-3.5 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.08] text-foreground/80 text-[13px] hover:border-white/20 hover:text-foreground transition-colors"
              >
                {з}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
