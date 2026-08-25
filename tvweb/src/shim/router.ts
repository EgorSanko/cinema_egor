/**
 * Замена next/navigation.
 *
 * Обёртка вызывает router.push/replace/back — в самостоятельном приложении
 * маршрут держим в адресной строке через #, потому что телевизор открывает
 * один статический файл и серверной маршрутизации нет.
 */
export function useRouter() {
  return {
    push(url: string) { window.location.hash = "#" + url; },
    replace(url: string) { window.location.replace("#" + url); },
    back() { window.history.back(); },
    refresh() { window.location.reload(); },
    prefetch(_url: string) { /* не нужно: всё уже в одном файле */ },
  };
}

export function usePathname(): string {
  const h = window.location.hash || "#/";
  return h.slice(1).split("?")[0];
}

export function useSearchParams(): URLSearchParams {
  const h = window.location.hash || "";
  const q = h.indexOf("?");
  return new URLSearchParams(q > -1 ? h.slice(q + 1) : "");
}

export function notFound(): never {
  window.location.hash = "#/";
  throw new Error("not found");
}
