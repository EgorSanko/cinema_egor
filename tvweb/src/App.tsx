import * as React from "react";
import { TvHome } from "@/components/tv/tv-home";
import { TvSearch } from "@/components/tv/tv-search";
import { TvLogin } from "@/components/tv/tv-login";
import { TvWatch } from "@/components/tv/tv-watch";
import { loadRails, loadWatchMedia, netState, type Rail } from "@/lib/api";

/**
 * Строка состояния в углу экрана.
 *
 * На телевизоре нет консоли, и «просто загрузка» неотличима от «приложение
 * встало». По логам видно, что данные приходят и постеры качаются, а человек
 * видит вечное ожидание — значит расходится внутреннее состояние с картинкой.
 * Эта строка показывает, на каком шаге приложение сейчас, и снимает вопрос.
 */
function Diag({ text }: { text: string }) {
  return (
    <div style={{
      position: "fixed", left: 8, bottom: 6, zIndex: 9999,
      fontSize: 12, color: "#71717a", fontFamily: "Arial, sans-serif",
      pointerEvents: "none", maxWidth: "90%", whiteSpace: "nowrap", overflow: "hidden",
    }}>{text}</div>
  );
}

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

export default function App({ initialRails, booting }: { initialRails?: Rail[] | null; booting?: boolean } = {}) {
  const [route, setRoute] = React.useState<Route>(() => parse(window.location.hash));
  // Подборки приходят снаружи (их грузит main.tsx до запуска приложения) —
  // так экран не зависит от того, выполнятся ли эффекты React на этом движке.
  const [rails, setRails] = React.useState<Rail[] | null>(initialRails ?? null);
  React.useEffect(() => { if (initialRails) setRails(initialRails); }, [initialRails]);
  const [media, setMedia] = React.useState<any | null>(null);
  const [error, setError] = React.useState("");
  const [, setTickCount] = React.useState(0);   // только чтобы перерисовать счётчик

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
    // Страховка на самом верху: даже если загрузка подборок как-то повиснет,
    // экран не останется в вечном ожидании — покажем понятную ошибку.
    const guard = setTimeout(() => {
      if (!alive) return;
      setError("Подборки не загрузились за 20 секунд. Нажмите OK, чтобы повторить.");
    }, 20000);
    // Пока ждём — раз в секунду перерисовываем экран, чтобы счётчик был живым.
    const tick = setInterval(() => { if (alive) setTickCount((n) => n + 1); }, 1000);
    loadRails().then((r) => {
      clearTimeout(guard);
      clearInterval(tick);
      if (!alive) return;
      if (!r.length) {
        // Пустой ответ — НЕ повод висеть в загрузке. Показываем причину и даём
        // повторить: на телевизоре человек иначе видит только вечный экран
        // «Загружаю…» и считает, что приложение сломано.
        setError("Не удалось загрузить подборки. Нажмите OK, чтобы повторить.");
        return;
      }
      setError("");
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

  const who = (() => {
    try {
      const u = JSON.parse(localStorage.getItem("user") || "null");
      return u && u.email ? u.email : "гость";
    } catch { return "гость"; }
  })();
  const diag = `экран: ${route.name} · вход: ${who} · подборок: ${rails ? rails.length : "грузятся"}`;

  if (route.name === "search") return (<><TvSearch /><Diag text={diag} /></>);
  if (route.name === "login") return (<><TvLogin /><Diag text={diag} /></>);

  if (route.name === "watch") {
    if (!media) return <Splash text={error || "Загружаю данные тайтла…"} />;
    return (<><TvWatch media={media} /><Diag text={diag} /></>);
  }

  if (rails && rails.length === 0) {
    return <Splash text="Подборки не загрузились. Нажмите OK, чтобы повторить." onRetry={() => window.location.reload()} />;
  }
  if (!rails) {
    // Показываем ЖИВОЙ счётчик: сколько запросов ушло, сколько вернулось, что
    // с последним. Иначе «Загружаю подборки» ничего не говорит о причине.
    const net = booting
      ? "готовлю подборки…"
      : `запросов ${netState.ответили}/${netState.начато}, ошибок ${netState.ошибок}`;
    return (
      <Splash
        text={(error || "Загружаю подборки…") + "  ·  " + net + (netState.последний ? "  ·  " + netState.последний : "")}
        onRetry={error ? () => { setError(""); setRails(null); } : undefined}
      />
    );
  }
  return (<><TvHome rails={rails} /><Diag text={diag} /></>);
}

function Splash({ text, onRetry }: { text: string; onRetry?: () => void }) {
  // Повтор по любой кнопке пульта — на телевизоре нет мыши, а тыкать OK
  // человек будет в первую очередь.
  React.useEffect(() => {
    if (!onRetry) return;
    const h = () => onRetry();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onRetry]);
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
