import { Navbar } from "@/components/navbar";

/**
 * Экран ожидания поиска (19.09.2026).
 *
 * Поиск — серверная страница: пока сервер отвечает, браузер держит СТАРЫЙ
 * экран, и человек не видит ни малейшего признака, что его запрос принят.
 * На телефоне с медленной связью это читается как «зависло»: на замере
 * переход занимал до двух секунд, и все эти две секунды экран не менялся
 * (три правки DOM за всё ожидание).
 *
 * Next показывает этот файл МГНОВЕННО при переходе на /search, ещё до ответа
 * сервера. Поэтому здесь ровно та же разметка, что у результатов: шапка,
 * строка «Ищем…» и сетка серых карточек того же размера — экран отзывается
 * сразу, а когда придут настоящие результаты, они встают на те же места без
 * прыжка.
 */
export default function SearchLoading() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto px-4 pt-24 pb-16">
        <div className="mb-8">
          <div className="relative">
            <div className="w-full h-12 rounded-full bg-white/[0.05] border border-white/[0.10] animate-pulse" />
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <span className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
          <span className="text-[15px] text-muted-foreground">Ищем…</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="aspect-[2/3] rounded-xl bg-white/[0.06]" />
              <div className="mt-2 h-3 rounded bg-white/[0.06]" />
              <div className="mt-1.5 h-3 w-2/3 rounded bg-white/[0.04]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
