/**
 * Позиция просмотра из окна Alloha.
 *
 * Их плеер работает в своём окне, и заглянуть внутрь мы не можем — другой
 * домен. Но он сам шлёт наружу события: `play`, `timeupdate` с точной секундой.
 * На них и держатся наши вещи: продолжить просмотр, история, отметка
 * «просмотрено». Без этого возврат Alloha означал бы потерю всего, к чему
 * зрители привыкли.
 *
 * Пишем не чаще раза в пять секунд: событие прилетает по нескольку раз в
 * секунду, а запись в хранилище на каждое — лишняя работа на слабом железе.
 */
type Сохранить = (секунда: number, длительность: number) => void;

const ИСТОЧНИК = /(^|\.)sapkeflykino\.ru$/;

export function слушатьОкноAlloha(сохранить: Сохранить): () => void {
  let последняя = 0;
  let длительность = 0;

  const принять = (e: MessageEvent) => {
    try {
      if (!ИСТОЧНИК.test(new URL(e.origin).hostname)) return;
    } catch {
      return;
    }
    let д: any = e.data;
    if (typeof д === "string") {
      try { д = JSON.parse(д); } catch { return; }
    }
    if (!д || typeof д !== "object") return;

    if (typeof д.duration === "number" && д.duration > 0) длительность = д.duration;

    const событие = String(д.event || "");
    const время = Number(д.time);
    if (!Number.isFinite(время) || время <= 0) return;

    // Конец фильма и пауза — записываем сразу: это те моменты, когда человек
    // уходит, и именно их обиднее всего потерять.
    const срочно = событие === "pause" || событие === "ended";
    if (!срочно && Date.now() - последняя < 5000) return;
    последняя = Date.now();
    сохранить(время, длительность || 0);
  };

  window.addEventListener("message", принять);
  return () => window.removeEventListener("message", принять);
}
