import * as React from "react";
import { TvHome } from "@/components/tv/tv-home";
import { TvSearch } from "@/components/tv/tv-search";
import { TvLogin } from "@/components/tv/tv-login";
import { TvWatch } from "@/components/tv/tv-watch";
import { loadRails, loadWatchMedia, type Rail } from "@/lib/api";

/**
 * Маршрутизация без сервера.
 *
 * На сайте экраны были серверными страницами (/tv-home, /tv-search,
 * /tv-watch/{тип}/{id}). Здесь приложение статическое: телевизор открывает
 * один файл, поэтому маршрут держим в адресной строке после решётки, а данные
 * подгружаем сами. Пути оставлены ТЕМИ ЖЕ, чтобы переносимые компоненты
 * ходили друг к другу без правок.
 */
type Route =
  | { name: "home" }
  | { name: "search" }
  | { name: "login" }
  | { name: "watch"; type: "movie" | "tv"; id: number };

function parse(hash: string): Route {
  const p = (hash || "").replace(/^#/, "").split("?")[0];
  if (p.indexOf("/tv-search") === 0) return { name: "search" };
  if (p.indexOf("/tv-login") === 0) return { name: "login" };
  const m = /^\/tv-watch\/(movie|tv)\/(\d+)/.exec(p);
  if (m) return { name: "watch", type: m[1] as "movie" | "tv", id: Number(m[2]) };
  return { name: "home" };
}

export default function App() {
  const [route, setRoute] = React.useState<Route>(() => parse(window.location.hash));
  const [rails, setRails] = React.useState<Rail[] | null>(null);
  const [media, setMedia] = React.useState<any | null>(null);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    const onHash = () => { setRoute(parse(window.location.hash)); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Главная: полки грузим один раз и держим — возврат из просмотра не должен
  // заново дёргать TMDB, на телевизоре это заметная пауза.
  React.useEffect(() => {
    if (route.name !== "home" || rails) return;
    let alive = true;
    loadRails().then((r) => {
      if (!alive) return;
      if (!r.length) setError("Не удалось загрузить подборки. Проверьте интернет на телевизоре.");
      setRails(r);
    });
    return () => { alive = false; };
  }, [route.name, rails]);

  React.useEffect(() => {
    if (route.name !== "watch") { setMedia(null); return; }
    let alive = true;
    setMedia(null);
    loadWatchMedia(route.type, route.id).then((m) => {
      if (!alive) return;
      if (!m) setError("Не удалось получить данные тайтла.");
      setMedia(m);
    });
    return () => { alive = false; };
  }, [route.name, (route as any).type, (route as any).id]);

  if (route.name === "search") return <TvSearch />;
  if (route.name === "login") return <TvLogin />;

  if (route.name === "watch") {
    if (!media) return <Splash text={error || "Загружаю…"} />;
    return <TvWatch media={media} />;
  }

  if (!rails) return <Splash text={error || "Загружаю…"} />;
  return <TvHome rails={rails} />;
}

function Splash({ text }: { text: string }) {
  return (
    <div style={{
      position: "fixed", left: 0, top: 0, right: 0, bottom: 0,
      background: "#0a0a0b", color: "#fff", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontFamily: "Arial, Helvetica, sans-serif", fontSize: 22,
    }}>
      {text}
    </div>
  );
}
