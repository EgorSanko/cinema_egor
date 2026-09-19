"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Clock } from "lucide-react";
import Link from "next/link";

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
  // Переход на страницу результатов — серверный, и на медленной связи он
  // занимает секунды. Без признака «принято» человек жмёт «искать» ещё раз
  // и думает, что всё висит. isPending горит ровно пока идёт этот переход.
  const [идётПоиск, начатьПереход] = useTransition();
  // Живые подсказки прямо под полем. Без них на телефоне единственный способ
  // что-то найти — напечатать, нажать «искать» и ждать переход на серверную
  // страницу. Теперь варианты видны по ходу набора, а нужный открывается
  // сразу, минуя страницу результатов.
  const [подсказки, setПодсказки] = useState<any[]>([]);

  useEffect(() => {
    try { setИстория(JSON.parse(localStorage.getItem(КЛЮЧ_ИСТОРИИ) || "[]")); } catch {}
    // Пустой запрос — человек пришёл именно искать, ставим курсор сразу.
    // С готовым запросом не перехватываем фокус: он пришёл смотреть результаты.
    if (!начальный) setTimeout(() => полеРеф.current?.focus(), 60);
  }, [начальный]);

  // Спрашиваем подсказки через четверть секунды после последней буквы и
  // отменяем прошлый запрос: пока человек печатает, промежуточные ответы уже
  // не нужны и только занимают канал.
  useEffect(() => {
    const q = текст.trim();
    if (q.length < 2) { setПодсказки([]); return; }
    const стоп = new AbortController();
    const таймер = setTimeout(() => {
      fetch(`/api/suggest?q=${encodeURIComponent(q)}`, { signal: стоп.signal })
        .then((r) => r.json())
        .then((d) => setПодсказки(Array.isArray(d?.results) ? d.results.slice(0, 6) : []))
        .catch(() => {});
    }, 250);
    return () => { clearTimeout(таймер); стоп.abort(); };
  }, [текст]);

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
    начатьПереход(() => router.push(`/search?q=${encodeURIComponent(запрос)}`));
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
        {идётПоиск ? (
          <span
            aria-label="Идёт поиск"
            className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin"
          />
        ) : текст ? (
          <button
            type="button"
            onClick={() => { setТекст(""); полеРеф.current?.focus(); }}
            aria-label="Очистить"
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-white/[0.06]"
          >
            <X size={16} />
          </button>
        ) : null}
      </form>

      {подсказки.length > 0 && (
        <div className="mt-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] overflow-hidden">
          {подсказки.map((п: any) => {
            const имя = п.title || п.name || "";
            const год = (п.release_date || п.first_air_date || "").slice(0, 4);
            return (
              <Link
                key={п.media_type + п.id}
                href={`/${п.media_type === "tv" ? "tv" : "movie"}/${п.id}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.05] transition-colors"
              >
                {п.poster_path ? (
                  <img
                    src={`/tmdb-img/w92${п.poster_path}`}
                    alt=""
                    loading="lazy"
                    className="w-8 h-12 rounded object-cover flex-shrink-0 bg-white/[0.06]"
                  />
                ) : (
                  <span className="w-8 h-12 rounded bg-white/[0.06] flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] text-foreground/90 truncate">{имя}</span>
                  <span className="block text-[12px] text-muted-foreground">
                    {год}{год && " · "}{п.media_type === "tv" ? "сериал" : "фильм"}
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      )}

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
