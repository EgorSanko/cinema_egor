/*
 * ТВ-клиент sapkeflykino — полный, паритет с веб-обёрткой /tv-*.
 *
 * Только ES5: var/function, XMLHttpRequest вместо fetch, коллбэки вместо
 * промисов. Код обязан выполниться на движке телевизора 2016 года — там нет
 * ни стрелочных функций, ни промисов, ни шаблонных строк.
 *
 * Данные и хранилище — ТЕ ЖЕ, что у сайта, чтобы просмотр продолжался между
 * телевизором и телефоном:
 *   user            — {email,name}
 *   kino_history    — лента просмотров (для «Продолжить»)
 *   kino_favorites  — избранное
 *   kino_pos_*      — позиция резюме; формат ключа обязан совпадать с сайтом,
 *                     иначе «продолжить» на телефоне не увидит просмотр с ТВ
 */
(function () {
  "use strict";

  // ── Диагностика ─────────────────────────────────────────────────────────
  // На телевизоре нет консоли и нет способа посмотреть ошибку. Поэтому любую
  // ошибку шлём себе КАРТИНКОЙ (переживает любые ограничения на запросы), а на
  // экране держим строку состояния. Именно так мы нашли, что на старых ТВ не
  // парсится основной сайт.
  function diag(text) {
    try {
      var d = document.getElementById("diag");
      if (d) d.innerHTML = String(text).replace(/</g, "&lt;");
    } catch (e) {}
  }
  function report(what, extra) {
    try {
      var i = new Image();
      i.src = "/tv-error?m=" + encodeURIComponent("tvapp: " + String(what).slice(0, 220)) +
              "&x=" + encodeURIComponent(String(extra || "").slice(0, 120));
    } catch (e) {}
  }
  window.onerror = function (m, src, line, col) {
    diag("ошибка: " + m);
    report(m, (src || "") + ":" + line + ":" + col);
  };
  try {
    window.addEventListener("unhandledrejection", function (e) {
      report("promise: " + ((e && e.reason && e.reason.message) || e.reason), "");
    });
  } catch (e) {}

  var TMDB_KEY = "275c9d09780aadb4b13ff57a731eda00";
  var TMDB = "/tmdb-api";
  var IMG = "/tmdb-img";
  var RESOLVE = "https://kino.lead-seek.ru/hdrezka/api";
  var ORIGIN = window.location.protocol + "//" + window.location.host;

  // Коды «назад» у каждой платформы свои: Tizen 10009, webOS 461, Android — Esc.
  var K = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 8, ESC: 27, TIZEN_BACK: 10009, WEBOS_BACK: 461,
            PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FWD: 417, REW: 412 };

  // Все коды, которые означают «назад».
  //
  // Логика выхода была правильной с самого начала: «назад» сначала прячет
  // настройки, потом панель управления и только потом закрывает просмотр. Но
  // Егору казалось, что панель не убрать — потому что до страницы не доходила
  // САМА КНОПКА. На его пульте приходят коды 1536 и 1537, которых в списке не
  // было: мы это уже ловили в большой обёртке.
  var КОДЫ_НАЗАД = [8, 27, 461, 10009, 1536, 1537];
  function этоНазад(c) {
    for (var i = 0; i < КОДЫ_НАЗАД.length; i++) if (c === КОДЫ_НАЗАД[i]) return true;
    return false;
  }

  var S = {
    screen: "login",
    user: null,
    rows: [], focus: { row: 0, col: 0 },
    query: "", kbLayout: 0, kb: { row: 0, col: 0 }, results: [],
    detail: null, detailFocus: 0, seasons: [], season: 1, episodes: [], epFocus: 0, detailZone: "buttons",
    play: { item: null, season: 0, episode: 0, translations: [], tr: 0, quality: "",
            overlay: "none", zone: "buttons", ctrl: 1, tab: 0, setIdx: 0,
            skipTime: null, epList: [] },
    history: [], favorites: [],
    stack: []
  };

  // ── Хранилище (совместимо с сайтом) ─────────────────────────────────────
  function lsGet(k, def) {
    try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch (e) { return def; }
  }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function positionKey(id, type, season, episode) {
    if (type === "tv" && season && episode) return "kino_pos_tv_" + id + "_s" + season + "e" + episode;
    return "kino_pos_" + type + "_" + id;
  }
  function getPosition(id, type, season, episode) {
    var p = lsGet(positionKey(id, type, season, episode), null);
    if (!p || p.done) return null;          // «надгробие» досмотренного прячем, как на сайте
    return p;
  }
  function savePosition(id, type, time, duration, season, episode) {
    if (time < 5 || duration < 10) return;
    var key = positionKey(id, type, season, episode);
    // Порог 0.95 и «надгробие» done:true — ровно как на сайте. Удалять ключ
    // нельзя: мёрж синка умеет только добавлять, и на другом устройстве
    // досмотренный фильм воскрес бы с резюме у самого конца.
    if (time / duration > 0.95) {
      lsSet(key, { time: 0, duration: duration, savedAt: now(), done: true });
    } else {
      lsSet(key, { time: time, duration: duration, savedAt: now() });
    }
    scheduleSync();
  }
  function now() { return new Date().getTime(); }

  function pushHistory(item, type, season, episode, progress, duration) {
    var h = S.history;
    var id = item.id;
    for (var i = 0; i < h.length; i++) {
      if (h[i].id === id && h[i].type === type) { h.splice(i, 1); break; }
    }
    h.unshift({
      id: id, type: type, title: titleOf(item), poster_path: item.poster_path || null,
      vote_average: item.vote_average || 0,
      release_date: item.release_date, first_air_date: item.first_air_date,
      watchedAt: now(), progress: progress || 0, duration: duration || 0,
      season: season || undefined, episode: episode || undefined
    });
    S.history = h.slice(0, 300);            // тот же кап, что на сайте
    lsSet("kino_history", S.history);
    scheduleSync();
  }

  function isFav(id, type) {
    for (var i = 0; i < S.favorites.length; i++) {
      if (S.favorites[i].id === id && S.favorites[i].type === type) return true;
    }
    return false;
  }
  function toggleFav(item, type) {
    if (isFav(item.id, type)) {
      var out = [];
      for (var i = 0; i < S.favorites.length; i++) {
        if (!(S.favorites[i].id === item.id && S.favorites[i].type === type)) out.push(S.favorites[i]);
      }
      S.favorites = out;
    } else {
      S.favorites.unshift({
        id: item.id, type: type, title: titleOf(item), poster_path: item.poster_path || null,
        vote_average: item.vote_average || 0, addedAt: now()
      });
    }
    lsSet("kino_favorites", S.favorites);
    scheduleSync();
  }

  // ── Сеть ────────────────────────────────────────────────────────────────
  function xhr(method, url, body, cb) {
    var r = new XMLHttpRequest();
    r.open(method, url, true);
    r.timeout = 30000;
    if (body) r.setRequestHeader("Content-Type", "application/json");
    r.onreadystatechange = function () {
      if (r.readyState !== 4) return;
      var data = null;
      try { data = JSON.parse(r.responseText); } catch (e) { data = null; }
      cb(r.status >= 200 && r.status < 300 ? data : null);
    };
    r.ontimeout = function () { cb(null); };
    r.onerror = function () { cb(null); };
    r.send(body ? JSON.stringify(body) : null);
  }
  function get(url, cb) { xhr("GET", url, null, cb); }
  function post(url, body, cb) { xhr("POST", url, body, cb); }

  function tmdb(path, params, cb) {
    var q = "api_key=" + TMDB_KEY + "&language=ru-RU";
    for (var k in params) if (params.hasOwnProperty(k)) q += "&" + k + "=" + encodeURIComponent(params[k]);
    get(TMDB + path + "?" + q, cb);
  }

  // ── Синхронизация с сервером ────────────────────────────────────────────
  var syncTimer = null;
  function scheduleSync() {
    if (!S.user || !S.user.email) return;
    if (syncTimer) clearTimeout(syncTimer);
    // Копим правки и шлём пачкой: на телевизоре сеть медленная, а во время
    // просмотра позиция обновляется каждые несколько секунд.
    syncTimer = setTimeout(pushSync, 8000);
  }
  function collectPositions() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("kino_pos_") === 0) out[k] = lsGet(k, null);
      }
    } catch (e) {}
    return out;
  }
  function pushSync() {
    if (!S.user || !S.user.email) return;
    post("/api/sync", { action: "save", email: S.user.email,
      data: { history: S.history, favorites: S.favorites, positions: collectPositions() } }, function () {});
  }
  function pullSync(cb) {
    if (!S.user || !S.user.email) { cb && cb(); return; }
    post("/api/sync", { action: "load", email: S.user.email }, function (d) {
      var data = d && d.data;
      if (data) {
        if (data.history) { S.history = data.history; lsSet("kino_history", S.history); }
        if (data.favorites) { S.favorites = data.favorites; lsSet("kino_favorites", S.favorites); }
        if (data.positions) {
          for (var k in data.positions) if (data.positions.hasOwnProperty(k)) lsSet(k, data.positions[k]);
        }
      }
      cb && cb();
    });
  }

  // ── Помощники ───────────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function poster(p) { return p ? IMG + "/w342" + p : ""; }
  function titleOf(o) { return o.title || o.name || ""; }
  function yearOf(o) { return String(o.release_date || o.first_air_date || "").slice(0, 4); }
  // Тип тайтла. Порядок проверок важен и выстрадан боевым багом.
  //
  // 1) __kind — НАШЕ поле, ставится один раз при создании объекта и переживает
  //    слияние с данными TMDB. Всё остальное — догадки.
  // 2) type — только если это ровно "movie"/"tv". У TMDB в данных сериала есть
  //    СВОЁ поле type со значением «Scripted», и оно затирало наш "tv".
  // 3) признаки сериала важнее наличия заголовка: карточкам «Продолжить» мы
  //    сами проставляем title обоим типам, поэтому «есть title = фильм» врал.
  //
  // Цена ошибки высокая: у TMDB нумерация фильмов и сериалов РАЗДЕЛЬНАЯ, и
  // номер 318354 — это и сериал «Холод», и фильм «Сказочная Русь».
  function typeOf(o) {
    if (!o) return "movie";
    if (o.__kind === "movie" || o.__kind === "tv") return o.__kind;
    if (o.type === "movie" || o.type === "tv") return o.type;
    if (o.name || o.first_air_date || o.number_of_seasons) return "tv";
    return "movie";
  }
  /** Проставляет тип объекту раз и навсегда. */
  function withKind(o, kind) {
    if (o && !o.__kind) o.__kind = kind || typeOf(o);
    return o;
  }

  // Источник отдаёт озвучку технической строкой вида
  // «(rus) AC3 20 @ 192 kbps - MVO 2x2 / Kravec». На телевизоре это нечитаемо,
  // поэтому оставляем то, что человек и называет озвучкой: студию после тире.
  function dubName(raw) {
    var s = String(raw || "").replace(/^\s*\((?:rus|ru|eng|ukr|[a-z]{2,3})\)\s*/i, "");
    var dash = s.lastIndexOf(" - ");
    if (dash > -1) s = s.slice(dash + 3);
    s = s.replace(/(AC3|AAC|E-?AC3|DTS|MP3)/gi, "")
         .replace(/\d+\s*@\s*\d+\s*kbps/gi, "")
         .replace(/\s{2,}/g, " ").trim();
    return s || String(raw || "").trim() || "Дорожка";
  }
  // У сериалов бывают две дорожки с одинаковым названием — нумеруем, иначе в
  // списке два неотличимых пункта.
  function dubLabel(i) {
    var list = S.play.translations, name = dubName((list[i] || {}).name);
    var same = 0, pos = 0;
    for (var j = 0; j < list.length; j++) {
      if (dubName(list[j].name) === name) { same++; if (j === i) pos = same; }
    }
    return same > 1 ? name + " · " + pos : name;
  }

  function mmss(t) {
    t = Math.max(0, Math.floor(t || 0));
    var h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
    return (h ? h + ":" + (m < 10 ? "0" : "") : "") + m + ":" + (s < 10 ? "0" : "") + s;
  }

  var toastTimer = null;
  function toast(msg) {
    var t = el("toast");
    t.innerHTML = esc(msg);
    t.className = "toast";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast hidden"; }, 3200);
  }

  function show(name) {
    var ids = ["login", "home", "search", "detail", "player"];
    for (var i = 0; i < ids.length; i++) {
      var e = el("screen-" + ids[i]);
      if (e) e.className = ids[i] === name ? "screen" : "screen hidden";
    }
    S.screen = name;
  }

  // Рисуем QR обычным SVG из чёрных квадратов.
  //
  // Не холстом и без новых возможностей браузера: на телевизорах Егора уже
  // была история, когда красивая библиотека загружалась, а на экране
  // оставалась пустота. Квадраты в SVG рисует любой движок.
  function qrSvg(текст, размер) {
    try {
      var qr = qrcode(0, "M");      // 0 — размер подберётся сам, M — средняя стойкость
      qr.addData(текст);
      qr.make();
      var n = qr.getModuleCount(), путь = "";
      for (var r = 0; r < n; r++) {
        for (var c = 0; c < n; c++) {
          if (qr.isDark(r, c)) путь += "M" + c + " " + r + "h1v1h-1z";
        }
      }
      return '<svg width="' + размер + '" height="' + размер + '" viewBox="0 0 ' + n + " " + n +
        '" shape-rendering="crispEdges" style="background:#ffffff;border-radius:10px">' +
        '<path d="' + путь + '" fill="#0a0a0b"/></svg>';
    } catch (e) {
      return "";   // не смогли нарисовать — ниже всё равно есть код и адрес
    }
  }

  // ── Вход по коду ────────────────────────────────────────────────────────
  var pollTimer = null;
  function startLogin() {
    diag("экран входа: запрашиваю код…");
    show("login");
    el("login-box").innerHTML = '<div class="login-title">Вход</div><div class="login-hint">Получаю код…</div>';
    post("/api/tv-link", { action: "create", intent: "tv" }, function (d) {
      if (!d || !d.code) {
        diag("код не получен — сервер не ответил");
        report("tv-link: пустой ответ", "");
        el("login-box").innerHTML =
          '<div class="login-title">Вход</div>' +
          '<div class="login-hint">Не получилось получить код. Нажмите OK, чтобы повторить, ' +
          'или «назад» — и смотрите без входа.</div>';
        return;
      }
      diag("код получен: " + d.code);
      var url = ORIGIN + "/link/" + d.code;
      el("login-box").innerHTML =
        '<div class="login-title">Вход</div>' +
        '<div class="login-qr">' + qrSvg(url, 300) + "</div>" +
        '<div class="login-side">' +
          '<div class="login-lead">Наведите камеру телефона</div>' +
          '<div class="login-code">' + esc(d.code) + "</div>" +
          '<div class="login-hint">или откройте на телефоне<br><b>' + esc(url) + "</b><br>" +
          "и подтвердите вход. Код живёт несколько минут.<br><br>" +
          "<b>OK — обновить код</b></div>" +
        "</div>";
      if (pollTimer) clearInterval(pollTimer);
      pollTimer = setInterval(function () {
        post("/api/tv-link", { action: "status", code: d.code }, function (st) {
          if (!st) return;
          if (st.status === "authorized" && st.user) {
            clearInterval(pollTimer); pollTimer = null;
            S.user = st.user;
            lsSet("user", st.user);
            toast("Здравствуйте, " + (st.user.name || st.user.email));
            pullSync(function () { enterHome(); });
          } else if (st.status === "expired") {
            clearInterval(pollTimer); pollTimer = null;
            startLogin();
          }
        });
      }, 3000);
    });
  }

  // ── Главная ─────────────────────────────────────────────────────────────
  function continueRow() {
    var items = [];
    // Один тайтл — одна карточка.
    //
    // История хранит запись НА КАЖДУЮ СЕРИЮ, поэтому «Холод» показывался
    // четырьмя одинаковыми карточками подряд. Берём только самую свежую по
    // каждому тайтлу: история отсортирована от новых к старым, значит первая
    // встреченная и есть нужная.
    var виден = {};
    for (var i = 0; i < S.history.length && items.length < 16; i++) {
      var h = S.history[i];
      var pos = getPosition(h.id, h.type, h.season, h.episode);
      if (!pos || !pos.time) continue;
      var ключ = h.id + ":" + h.type;
      if (виден[ключ]) continue;
      виден[ключ] = true;
      // title И name сразу оба — карточка не знает, что именно рисовать. Тип
      // при этом фиксируем явно, иначе «есть title» позже читается как фильм.
      items.push({
        id: h.id, title: h.title, name: h.title, poster_path: h.poster_path,
        type: h.type, __kind: h.type === "tv" ? "tv" : "movie",
        __resume: pos.time, __season: h.season, __episode: h.episode
      });
    }
    return items;
  }

  function выйтиИзАккаунта() {
    // Убираем и учётку, и местные копии данных: иначе следующий человек увидел
    // бы чужую историю и «Продолжить просмотр». На сервере всё сохранено и
    // вернётся при следующем входе.
    try {
      lsSet("user", null);
      var убрать = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && (k === "user" || k.indexOf("kino_") === 0)) убрать.push(k);
      }
      for (var j = 0; j < убрать.length; j++) localStorage.removeItem(убрать[j]);
    } catch (e) {}
    S.user = null;
    S.history = [];
    S.favorites = [];
    location.reload();
  }

  function enterHome() {
    diag("главная: загружаю подборки…");
    show("home");
    el("who").innerHTML = S.user ? esc(S.user.name || S.user.email) : "Гость";
    loadHome();
  }

  function loadHome() {
    var rows = [];
    var cont = continueRow();
    if (cont.length) rows.push({ title: "Продолжить просмотр", items: cont });
    if (S.favorites.length) {
      var favs = [];
      for (var fi = 0; fi < Math.min(16, S.favorites.length); fi++) {
        favs.push(withKind(S.favorites[fi], S.favorites[fi].type));
      }
      rows.push({ title: "Избранное", items: favs });
    }
    rows.push({ title: "", items: [
      { __search: true, title: "Поиск" },
      { __logout: true, title: "Выйти" }
    ] });
    rows.push({ title: "Сейчас в тренде", items: [] });
    rows.push({ title: "Популярные сериалы", items: [] });
    rows.push({ title: "Новинки", items: [] });
    S.rows = rows;
    S.focus = { row: 0, col: 0 };
    renderHome();

    var base = rows.length - 3;  // три последних ряда догружаются с TMDB
    tmdb("/trending/movie/week", {}, function (d) {
      var r = (d && d.results ? d.results : []);
      if (!r.length) { diag("тренды не пришли — проверьте интернет на телевизоре"); report("trending пуст", ""); }
      else diag("готово · стрелки — выбор, OK — открыть");
      rows[base].items = r.slice(0, 18); renderHome();
    });
    tmdb("/tv/popular", {}, function (d) {
      var list = (d && d.results ? d.results : []).slice(0, 18);
      for (var i = 0; i < list.length; i++) withKind(list[i], "tv");
      rows[base + 1].items = list; renderHome();
    });
    tmdb("/movie/now_playing", {}, function (d) {
      rows[base + 2].items = (d && d.results ? d.results : []).slice(0, 18); renderHome();
    });
  }

  function cardHtml(item, focused) {
    if (item.__logout) {
      // Выход из аккаунта. Раньше его в клиенте не было вовсе: сменить
      // пользователя на телевизоре было нечем.
      return '<div class="searchbar logoutbar' + (focused ? " focused" : "") + '">' +
        '<span class="searchglyph">ВЫЙТИ</span>' +
        '<span class="searchhint">сменить аккаунт</span></div>';
    }
    if (item.__search) {
      // Узкая строка вместо плитки в размер постера: ряд экрана она больше не
      // занимает, а нажимается так же.
      return '<div class="searchbar' + (focused ? " focused" : "") + '">' +
        '<span class="searchglyph">ПОИСК</span>' +
        '<span class="searchhint">название фильма или сериала</span></div>';
    }
    var img = poster(item.poster_path);
    var badge = typeOf(item) === "tv" ? "сериал" : "фильм";
    var resume = "";
    if (item.__resume) resume = '<div class="resume">с ' + esc(mmss(item.__resume)) + "</div>";
    return '<div class="card' + (focused ? " focused" : "") + '">' +
      (img ? '<img src="' + esc(img) + '" alt="">' : '<div class="noposter">' + esc(titleOf(item)) + "</div>") +
      '<div class="badge">' + badge + "</div>" + resume +
      '<div class="cap">' + esc(titleOf(item)) + "</div></div>";
  }

  function renderHome() {
    var h = "";
    for (var r = 0; r < S.rows.length; r++) {
      var row = S.rows[r];
      // Полке с поиском высота под постеры не нужна — иначе она резервирует
      // 250 точек пустоты и выталкивает следующие полки за нижний край.
      // Проверяем ПЕРВЫЙ элемент, а не количество: когда рядом с поиском
      // появилась кнопка «Выйти», элементов стало два, метка перестала
      // ставиться, и полка вернула себе высоту под постеры — отсюда разрыв в
      // треть экрана перед «Сейчас в тренде».
      var поиск = row.items.length > 0 && (row.items[0].__search || row.items[0].__logout);
      h += '<div class="row' + (поиск ? " row-search" : "") + '">' +
           '<div class="row-title">' + esc(row.title) + "</div>";
      h += '<div class="row-strip">';
      if (!row.items.length) h += '<div class="row-empty">загружаю…</div>';
      for (var c = 0; c < row.items.length; c++) {
        h += cardHtml(row.items[c], r === S.focus.row && c === S.focus.col);
      }
      h += "</div></div>";
    }
    el("rows").innerHTML = h;
    // Прокрутка вручную: старые прошивки не умеют scrollIntoView с опциями.
    var strips = el("rows").getElementsByClassName("row-strip");
    var CARD = 166;
    if (strips[S.focus.row]) {
      strips[S.focus.row].style.marginLeft = "-" + Math.max(0, (S.focus.col - 3) * CARD) + "px";
    }
    var ROWH = 300;
    el("rows").style.marginTop = "-" + Math.max(0, (S.focus.row - 1) * ROWH) + "px";
  }

  // ── Поиск ───────────────────────────────────────────────────────────────
  var LAYOUTS = [
    [ "АБВГДЕЁЖЗИЙ".split(""), "КЛМНОПРСТУФ".split(""), "ХЦЧШЩЪЫЬЭЮЯ".split(""),
      "0123456789".split(""), ["ПРОБЕЛ", "СТЕРЕТЬ", "ABC"] ],
    [ "ABCDEFGHIJ".split(""), "KLMNOPQRST".split(""), "UVWXYZ".split(""),
      "0123456789".split(""), ["ПРОБЕЛ", "СТЕРЕТЬ", "АБВ"] ]
  ];
  function keys() { return LAYOUTS[S.kbLayout]; }

  function renderSearch() {
    var rows = keys(), h = "";
    for (var r = 0; r < rows.length; r++) {
      h += '<div class="krow">';
      for (var c = 0; c < rows[r].length; c++) {
        var f = (S.kb.row === r && S.kb.col === c) ? " focused" : "";
        h += '<div class="key' + f + '">' + esc(rows[r][c]) + "</div>";
      }
      h += "</div>";
    }
    el("keyboard").innerHTML = h;
    el("query").innerHTML = S.query ? esc(S.query) : "&nbsp;";
    var g = "";
    for (var i = 0; i < S.results.length; i++) {
      g += cardHtml(S.results[i], S.kb.row === -1 && S.kb.col === i);
    }
    el("results").innerHTML = g || (S.query.length >= 2 ? '<div class="row-empty">ничего не нашлось</div>' : "");
    var grid = el("results");
    if (S.kb.row === -1) grid.style.marginLeft = "-" + Math.max(0, (S.kb.col - 3) * 166) + "px";
    else grid.style.marginLeft = "0px";
  }

  var searchTimer = null;
  function runSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    if (S.query.length < 2) { S.results = []; renderSearch(); return; }
    searchTimer = setTimeout(function () {
      var q = S.query, pending = 2, movies = [], tv = [];
      function done() {
        if (--pending > 0) return;
        // Чередуем типы. На сайте этого не было, и сериалы вылетали за предел
        // показа целиком — по запросу «Холод» их срезало все до одного.
        var out = [];
        for (var i = 0; i < Math.max(movies.length, tv.length); i++) {
          if (i < movies.length) out.push(movies[i]);
          if (i < tv.length) out.push(tv[i]);
        }
        S.results = out.slice(0, 24);
        renderSearch();
      }
      tmdb("/search/movie", { query: q }, function (d) {
        movies = (d && d.results ? d.results : []).slice(0, 12);
        for (var i = 0; i < movies.length; i++) withKind(movies[i], "movie");
        done();
      });
      tmdb("/search/tv", { query: q }, function (d) {
        tv = (d && d.results ? d.results : []).slice(0, 12);
        for (var i = 0; i < tv.length; i++) withKind(tv[i], "tv");
        done();
      });
    }, 400);
  }

  // ── Карточка тайтла ─────────────────────────────────────────────────────
  function openDetail(item) {
    S.detail = item;
    S.detailFocus = 0;
    S.detailZone = "buttons";
    S.seasons = []; S.episodes = []; S.epFocus = 0;
    S.season = item.__season || 1;
    show("detail");
    renderDetail();
    var type = typeOf(item);
    // Полные данные: описание в списках TMDB обрезано, а для сериала нужны сезоны.
    tmdb("/" + type + "/" + item.id, {}, function (d) {
      if (!d) return;
      S.detail = mergeItem(item, d);
      if (type === "tv") {
        var list = [];
        var seasons = d.seasons || [];
        for (var i = 0; i < seasons.length; i++) {
          if (seasons[i].season_number > 0) list.push(seasons[i].season_number);
        }
        S.seasons = list.length ? list : [1];
        if (S.seasons.join(",").indexOf(String(S.season)) === -1) S.season = S.seasons[0];
        loadEpisodes(S.season);
      }
      renderDetail();
    });
  }
  function mergeItem(a, b) {
    var out = {};
    for (var k in a) if (a.hasOwnProperty(k)) out[k] = a[k];
    for (var k2 in b) if (b.hasOwnProperty(k2)) out[k2] = b[k2];
    // Тип берём от ИСХОДНОГО объекта: в ответе TMDB своё поле type
    // («Scripted» у сериалов), и без этой строки оно затирает правильный.
    out.__kind = typeOf(a);
    return out;
  }

  function loadEpisodes(season) {
    S.episodes = [];
    renderDetail();
    get("/api/tv-episodes?id=" + S.detail.id + "&season=" + season, function (d) {
      var все = (d && d.length) ? d : [];
      // Только ВЫШЕДШИЕ серии. У «Холода» источник отдаёт десять, а вышло
      // шесть: остальные с датой в будущем. В логах видно, что Егор заходил в
      // девятую — там пусто по определению. Серию без даты не прячем: это чаще
      // пробел в данных, чем будущий эфир.
      var сегодня = new Date().toISOString().slice(0, 10);
      var вышли = [];
      for (var i = 0; i < все.length; i++) {
        var a = все[i].air_date;
        if (!a || a <= сегодня) вышли.push(все[i]);
      }
      S.episodes = вышли.length ? вышли : все;
      renderDetail();
    });
  }

  function renderDetail() {
    var item = S.detail;
    if (!item) return;
    var type = typeOf(item);
    var img = poster(item.poster_path);
    var meta = [];
    if (yearOf(item)) meta.push(yearOf(item));
    meta.push(type === "tv" ? "сериал" : "фильм");
    if (item.vote_average) meta.push("оценка " + Math.round(item.vote_average * 10) / 10);
    if (item.genres && item.genres.length) {
      var g = [];
      for (var i = 0; i < Math.min(3, item.genres.length); i++) g.push(item.genres[i].name);
      meta.push(g.join(", "));
    }

    var pos = getPosition(item.id, type, type === "tv" ? S.season : 0, type === "tv" ? episodeNumber() : 0);
    var playLabel = pos && pos.time ? "Продолжить с " + mmss(pos.time) : "Смотреть";
    var favLabel = isFav(item.id, type) ? "В избранном" : "В избранное";

    // Набор кнопок считаем заранее: «Сначала» появляется, только если есть с
    // чего продолжать. Иначе она дублировала бы «Смотреть».
    S.detailBtns = pos && pos.time ? ["play", "restart", "fav"] : ["play", "fav"];
    var подписи = { play: playLabel, restart: "Сначала", fav: favLabel };
    var btns = '<div class="btns">';
    for (var bi = 0; bi < S.detailBtns.length; bi++) {
      var код = S.detailBtns[bi];
      btns += '<span class="btn' + (код === "play" ? "" : " secondary") +
        (S.detailZone === "buttons" && S.detailFocus === bi ? " focused" : "") + '">' +
        esc(подписи[код]) + "</span>";
    }
    btns += "</div>";

    var seasonsHtml = "";
    if (type === "tv" && S.seasons.length) {
      seasonsHtml += '<div class="seasons">';
      for (var s = 0; s < S.seasons.length; s++) {
        var sf = (S.detailZone === "seasons" && S.detailFocus === s) ? " focused" : "";
        var cur = S.seasons[s] === S.season ? " current" : "";
        seasonsHtml += '<span class="season' + sf + cur + '">' + S.seasons[s] + " сезон</span>";
      }
      seasonsHtml += "</div>";
    }

    var epsHtml = "";
    if (type === "tv") {
      epsHtml += '<div class="eps">';
      if (!S.episodes.length) epsHtml += '<div class="row-empty">загружаю серии…</div>';
      for (var e = 0; e < S.episodes.length; e++) {
        var ep = S.episodes[e];
        var ef = (S.detailZone === "episodes" && S.epFocus === e) ? " focused" : "";
        var epos = getPosition(item.id, "tv", S.season, ep.episode_number);
        // Кадр из серии, как в большой обёртке: список из одних номеров
        // читается плохо.
        var кадр = ep.still_path ? '<img class="epimg" src="/tmdb-img/w300' + esc(ep.still_path) + '" alt="">'
                                 : '<span class="epimg noimg"></span>';
        epsHtml += '<div class="ep' + ef + '">' + кадр +
          '<span class="epn">' + ep.episode_number + "</span>" +
          '<span class="epname">' + esc(ep.name || ("Серия " + ep.episode_number)) + "</span>" +
          (epos && epos.time ? '<span class="epres">с ' + esc(mmss(epos.time)) + "</span>" : "") +
          "</div>";
      }
      epsHtml += "</div>";
    }

    el("detail").innerHTML =
      '<div class="detail-top">' +
        (img ? '<img class="detail-poster" src="' + esc(img) + '" alt="">' : '<div class="detail-poster"></div>') +
        '<div class="detail-info">' +
          '<div class="detail-title">' + esc(titleOf(item)) + "</div>" +
          '<div class="detail-meta">' + esc(meta.join(" · ")) + "</div>" +
          '<div class="detail-text">' + esc(item.overview || "Описание пока не добавлено.") + "</div>" +
          btns + seasonsHtml +
        "</div>" +
      "</div>" + epsHtml;

    var eps = el("detail").getElementsByClassName("eps")[0];
    if (eps && S.detailZone === "episodes") {
      // Шаг прокрутки обязан совпадать с высотой строки в стилях (.ep вместе с
      // отступом). Раньше здесь стояло 46 — под строку без кадра; когда
      // появился кадр, строка стала вдвое выше, и список уезжал мимо.
      eps.scrollTop = Math.max(0, (S.epFocus - 2) * 74);
    }
  }

  function episodeNumber() {
    if (S.episodes.length && S.episodes[S.epFocus]) return S.episodes[S.epFocus].episode_number;
    return S.detail && S.detail.__episode ? S.detail.__episode : 1;
  }

  // ── Плеер ───────────────────────────────────────────────────────────────
  // Устройство ровно как в веб-обёртке: оверлей «нет → управление → настройки»,
  // панель сама прячется через 5 секунд, таймлайн — отдельная зона фокуса.
  function firstMirror(u) { return String(u || "").split(" or ")[0]; }

  var QORDER = ["2160", "1440", "1080", "1080p", "720", "720p", "480", "480p", "360", "360p"];
  function pickQuality(q, want) {
    if (want && q[want]) return { url: q[want], q: want };
    for (var i = 0; i < QORDER.length; i++) if (q[QORDER[i]]) return { url: q[QORDER[i]], q: QORDER[i] };
    for (var k in q) if (q.hasOwnProperty(k)) return { url: q[k], q: k };
    return null;
  }
  function qualityList() {
    var t = S.play.translations[S.play.tr] || {};
    var q = t.quality || {}, out = [];
    for (var i = 0; i < QORDER.length; i++) if (q[QORDER[i]]) out.push(QORDER[i]);
    if (!out.length) for (var k in q) if (q.hasOwnProperty(k)) out.push(k);
    return out;
  }

  function startPlayback(item, season, episode) {
    S.play.item = item; S.play.season = season || 0; S.play.episode = episode || 0;
    S.play.translations = []; S.play.tr = 0; S.play.overlay = "none";
    S.play.zone = "buttons"; S.play.ctrl = 1; S.play.skipTime = null;
    S.play.epList = (typeOf(item) === "tv") ? S.episodes.slice(0) : [];
    show("player");
    hideSkip(); hideOverlay();
    msg("Ищу источник…");

    var type = typeOf(item);
    var tail = (type === "tv" ? "&season=" + (season || 1) + "&episode=" + (episode || 1) : "");
    var year = yearOf(item);

    // Цепочка та же, что у веб-обёртки. Раньше здесь был один Alloha по imdb, и
    // у тайтлов БЕЗ кода IMDb (свежие и российские — у TMDB его часто нет)
    // получался тупик с сообщением «нет кода IMDb» вместо кино. Теперь: если
    // кода нет, сразу идём в поиск по названию; если есть — сначала источники
    // по коду, а поиск по названию остаётся последним запасным.
    var steps = [];
    function byName() {
      if (type !== "movie") return null;   // vkmovie умеет только фильмы
      var p = "title=" + encodeURIComponent(titleOf(item)) +
              "&year=" + encodeURIComponent(year) + "&type=movie";
      var ot = item.original_title || item.original_name;
      if (ot && ot !== titleOf(item)) p += "&otitle=" + encodeURIComponent(ot);
      return RESOLVE + "/vkmovie?" + p;
    }

    tmdb("/" + type + "/" + item.id + "/external_ids", {}, function (ids) {
      var imdb = ids && ids.imdb_id;
      if (imdb) {
        steps.push({ url: RESOLVE + "/alloha-hls?imdb=" + encodeURIComponent(imdb) + "&type=" + type + tail,
                     note: "" });
        steps.push({ url: RESOLVE + "/cdnhub?imdb=" + encodeURIComponent(imdb) + "&type=" + type + tail,
                     note: "Основной источник молчит, пробую запасной…" });
      }
      var nameUrl = byName();
      if (nameUrl) steps.push({ url: nameUrl, note: "Ищу по названию…" });

      if (!steps.length) {
        msg(type === "tv"
          ? "Этого сериала нет ни у одного источника — у него нет кода IMDb, а по названию сериалы не ищутся."
          : "Этот фильм не удалось найти ни по коду, ни по названию.");
        return;
      }
      tryStep(0);
    });

    function tryStep(i) {
      if (i >= steps.length) {
        msg("Этого " + (type === "tv" ? "эпизода" : "фильма") + " сейчас нет ни у одного источника.");
        return;
      }
      if (steps[i].note) msg(steps[i].note);
      get(steps[i].url, function (d) {
        if (d && d.translations && d.translations.length) { onTranslations(d); return; }
        tryStep(i + 1);
      });
    }
  }

  function onTranslations(d) {
    S.play.translations = d.translations;
    // skipTime от Alloha — окно заставки, по нему показываем «Пропустить».
    S.play.skipTime = d.skipTime || null;
    // Озвучку держим между сериями по ИМЕНИ: индексы между эпизодами разъезжаются.
    var want = lsGet("kino_tv_tr_" + S.play.item.id, null);
    var idx = 0;
    if (want) {
      for (var i = 0; i < d.translations.length; i++) {
        if (String(d.translations[i].name).toLowerCase() === String(want).toLowerCase()) { idx = i; break; }
      }
    }
    playTranslation(idx, true);
  }

  function playTranslation(idx, useResume) {
    var t = S.play.translations[idx];
    if (!t) { msg("Эта озвучка не открылась."); return; }
    var pick = pickQuality(t.quality || {}, S.play.quality);
    if (!pick) { msg("Источник не отдал ссылку на поток."); return; }
    S.play.tr = idx;
    S.play.quality = pick.q;
    lsSet("kino_tv_tr_" + S.play.item.id, t.name);
    var v = el("video");
    var resumeAt = 0;
    if (useResume) {
      var p = S.playFromStart ? null : getPosition(S.play.item.id, typeOf(S.play.item), S.play.season, S.play.episode);
      S.playFromStart = false;
      if (p && p.time > 5) resumeAt = p.time;
    } else {
      resumeAt = v.currentTime || 0;   // смена озвучки и качества не теряет место
    }
    msg("Загружаю…");
    var адрес = firstMirror(pick.url);

    // Играем САМИ, если телевизор не умеет HLS встроенно.
    //
    // Samsung забирал плейлист и на этом останавливался: ни одного запроса за
    // кусками видео. Поэтому там разбираем поток сами и скармливаем телевизору
    // готовые куски. Буфер ограничиваем — у этого поколения телевизоров память
    // кончается быстро, и это уже роняло у нас главную.
    if (window.__hls) { try { window.__hls.destroy(); } catch (e) {} window.__hls = null; }

    // НЕ ВЕРИМ телевизору на слово.
    //
    // Samsung на вопрос «умеешь HLS сам?» отвечает «да», а на деле поток не
    // открывает: на экране появлялось наше «Телевизор не смог открыть этот
    // поток» — сообщение как раз из ветки встроенного проигрывания. В логах при
    // этом видно, что плейлист он забрал, а за кусками видео так и не пошёл.
    //
    // Поэтому если умеем разбирать поток сами — разбираем сами. Встроенное
    // проигрывание остаётся запасным путём: для телевизоров, где нашего
    // разбора нет.
    try {
      var i = new Image();
      i.src = "/tv-error?m=" + encodeURIComponent(
        "плеер: " + ((window.Hls && window.Hls.isSupported()) ? "свой разбор" : "встроенный"));
    } catch (e) {}

    if (адрес.indexOf(".m3u8") >= 0 && window.Hls && window.Hls.isSupported()) {
      var h = new window.Hls({
        enableWorker: false,      // на слабых телевизорах отдельный поток только мешает
        maxBufferLength: 20,
        maxMaxBufferLength: 40,
        backBufferLength: 20
      });
      window.__hls = h;
      h.loadSource(адрес);
      h.attachMedia(v);
      h.on(window.Hls.Events.MANIFEST_PARSED, function () {
        if (resumeAt > 0) { try { v.currentTime = resumeAt; } catch (e) {} }
        msg("");
        try { v.play(); } catch (e) {}
        flashOverlay();
      });
      h.on(window.Hls.Events.ERROR, function (_e, d) {
        if (!d || !d.fatal) return;
        if (d.type === window.Hls.ErrorTypes.NETWORK_ERROR) h.startLoad();
        else if (d.type === window.Hls.ErrorTypes.MEDIA_ERROR) h.recoverMediaError();
        else msg("Не удалось проиграть. Нажмите OK и выберите другую озвучку.");
      });
      v.ontimeupdate = onTimeUpdate;
      v.onended = onEnded;
      return;
    }

    v.src = адрес;
    v.onloadedmetadata = function () {
      if (resumeAt > 0 && resumeAt < (v.duration || 1e9)) { try { v.currentTime = resumeAt; } catch (e) {} }
      msg("");
      try { v.play(); } catch (e) {}
      flashOverlay();
    };
    v.onerror = function () {
      msg("Телевизор не смог открыть этот поток. Нажмите OK и выберите другую озвучку.");
    };
    v.ontimeupdate = onTimeUpdate;
    v.onended = onEnded;
  }

  function msg(t) { el("player-msg").innerHTML = t ? esc(t) : ""; }

  // ── Оверлей управления ──────────────────────────────────────────────────
  var hideTimer = null;
  function flashOverlay() {
    S.play.overlay = "controls";
    renderControls();
    armHide();
  }
  function armHide() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (S.play.overlay === "controls") { S.play.overlay = "none"; hideOverlay(); }
    }, 5000);
  }
  function hideOverlay() {
    el("controls").className = "controls hidden";
    el("settings").className = "settings hidden";
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  }

  var CBTN = ["-10", "Пауза", "+10", "Настройки", "Выход"];
  function renderControls() {
    if (S.play.overlay !== "controls") { hideOverlay(); return; }
    var v = el("video"), item = S.play.item;
    var sub = (typeOf(item) === "tv" && S.play.season) ? (" · S" + S.play.season + "E" + S.play.episode) : "";
    el("ctitle").innerHTML = "<b>" + esc(titleOf(item)) + "</b>" + esc(sub) +
      '  <span class="dim">озвучка</span> ' + esc(S.play.translations.length ? dubLabel(S.play.tr) : "—") +
      '  <span class="dim">качество</span> ' + esc(S.play.quality || "—");
    el("timeline").className = "timeline" + (S.play.zone === "timeline" ? " focused" : "");
    var h = "";
    for (var i = 0; i < CBTN.length; i++) {
      var label = (i === 1) ? (v.paused ? "Пуск" : "Пауза") : CBTN[i];
      h += '<span class="cbtn' + (S.play.zone === "buttons" && S.play.ctrl === i ? " focused" : "") + '">' + esc(label) + "</span>";
    }
    el("cbuttons").innerHTML = h;
    el("controls").className = "controls";
    updateProgress();
  }
  function updateProgress() {
    var v = el("video");
    var d = v.duration || 0, c = v.currentTime || 0;
    el("tlfill").style.width = (d ? Math.min(100, (c / d) * 100) : 0) + "%";
    el("tcur").innerHTML = mmss(c);
    el("tdur").innerHTML = mmss(d);
  }

  function showSkip() { el("skip").className = "skip"; }
  function hideSkip() { el("skip").className = "skip hidden"; }

  function onTimeUpdate() {
    if (S.play.overlay === "controls") updateProgress();
    var v = el("video"), st = S.play.skipTime;
    if (st && st.start != null && st.end != null) {
      if (v.currentTime >= st.start && v.currentTime < st.end) showSkip(); else hideSkip();
    }
  }

  function onEnded() {
    var item = S.play.item;
    if (typeOf(item) !== "tv") { goBack(); return; }
    // Следующая серия того же сезона, если она есть в загруженном списке.
    var list = S.play.epList, next = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].episode_number === S.play.episode && list[i + 1]) { next = list[i + 1]; break; }
    }
    if (!next) { toast("Сезон закончился"); goBack(); return; }
    toast("Следующая серия: " + (next.name || ("Серия " + next.episode_number)));
    startPlayback(item, S.play.season, next.episode_number);
  }

  // ── Настройки в плеере ──────────────────────────────────────────────────
  function renderSettings() {
    if (S.play.overlay !== "settings") { el("settings").className = "settings hidden"; return; }
    var h = '<div class="tabs">' +
      '<span class="tab' + (S.play.tab === 0 ? " current" : "") + (S.play.zone === "tabs" && S.play.tab === 0 ? " focused" : "") + '">Озвучка</span>' +
      '<span class="tab' + (S.play.tab === 1 ? " current" : "") + (S.play.zone === "tabs" && S.play.tab === 1 ? " focused" : "") + '">Качество</span>' +
      "</div>";
    var i;
    if (S.play.tab === 0) {
      for (i = 0; i < S.play.translations.length; i++) {
        h += '<div class="pitem' + (S.play.zone === "list" && S.play.setIdx === i ? " focused" : "") +
             (i === S.play.tr ? " current" : "") + '">' + esc(dubLabel(i)) + "</div>";
      }
    } else {
      var qs = qualityList();
      for (i = 0; i < qs.length; i++) {
        h += '<div class="pitem' + (S.play.zone === "list" && S.play.setIdx === i ? " focused" : "") +
             (qs[i] === S.play.quality ? " current" : "") + '">' + esc(qs[i]) + "</div>";
      }
    }
    el("settings").innerHTML = h;
    el("settings").className = "settings";
  }
  function settingsLen() {
    return S.play.tab === 0 ? S.play.translations.length : qualityList().length;
  }

  // Шаг перемотки РАСТЁТ при удержании.
  //
  // Было ровно 10 секунд за нажатие: отмотать час назад — это триста нажатий.
  // Теперь если жать подряд, шаг увеличивается: 10, 30, 60, 120, 300 секунд.
  // Пауза дольше секунды сбрасывает обратно на 10 — короткая подводка не
  // превращается в прыжок через полфильма.
  var ШАГИ = [10, 30, 60, 120, 300];
  var шагИндекс = 0, шагКогда = 0, шагКуда = 0, окноШага = null;
  function seek(delta) {
    var v = el("video");
    if (!v.duration) return;
    var сейчас = new Date().getTime();
    var знак = delta < 0 ? -1 : 1;
    if (сейчас - шагКогда < 1000 && знак === шагКуда) {
      шагИндекс = Math.min(шагИндекс + 1, ШАГИ.length - 1);
    } else {
      шагИндекс = 0;
    }
    шагКогда = сейчас;
    шагКуда = знак;
    var шаг = ШАГИ[шагИндекс] * знак;
    try { v.currentTime = Math.max(0, Math.min(v.duration, (v.currentTime || 0) + шаг)); } catch (e) {}
    // Показываем шаг и ГАСИМ через секунду. Раньше надпись оставалась на
    // экране навсегда: я её выводил и не убирал.
    msg(шагИндекс > 0 ? (знак < 0 ? "◀◀ " : "▶▶ ") + ШАГИ[шагИндекс] + " с" : "");
    if (окноШага) clearTimeout(окноШага);
    окноШага = setTimeout(function () { msg(""); }, 1000);
    updateProgress();
  }
  function togglePlay() {
    var v = el("video");
    if (v.paused) { try { v.play(); } catch (e) {} } else v.pause();
    renderControls();
  }

  // Сохранение позиции: раз в 10 секунд и при выходе.
  var saveTimer = null;
  function startSaving() {
    if (saveTimer) clearInterval(saveTimer);
    saveTimer = setInterval(function () {
      var v = el("video");
      if (!v || v.paused || !v.duration) return;
      var type = typeOf(S.play.item);
      savePosition(S.play.item.id, type, v.currentTime, v.duration, S.play.season, S.play.episode);
      pushHistory(S.play.item, type, S.play.season, S.play.episode, v.currentTime, v.duration);
    }, 10000);
  }
  function stopPlayback() {
    var v = el("video");
    if (v && v.duration && S.play.item) {
      var type = typeOf(S.play.item);
      savePosition(S.play.item.id, type, v.currentTime, v.duration, S.play.season, S.play.episode);
      pushHistory(S.play.item, type, S.play.season, S.play.episode, v.currentTime, v.duration);
      pushSync();
    }
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
    try { v.pause(); } catch (e) {}
    v.removeAttribute("src");
    try { v.load(); } catch (e) {}
    S.play.overlay = "none";
    hideOverlay(); hideSkip();
  }

  // ── Управление ──────────────────────────────────────────────────────────
  function onKey(e) {
    var c = e.keyCode;
    if (этоНазад(c)) { e.preventDefault(); goBack(); return; }
    // Неопознанные кнопки шлём себе: на телевизоре нет консоли, а пульты у всех
    // разные. По этим сигналам мы и нашли 1536 и 1537.
    if (c !== K.LEFT && c !== K.UP && c !== K.RIGHT && c !== K.DOWN && c !== K.OK) {
      try {
        var i = new Image();
        i.src = "/tv-error?m=" + encodeURIComponent(
          "кнопка без разбора: " + c + " экран:" + S.screen +
          (S.screen === "player" ? " панель:" + S.play.overlay : ""));
      } catch (e2) {}
    }
    if (S.screen === "login") return loginKey(c);
    if (S.screen === "home") return homeKey(c);
    if (S.screen === "search") return searchKey(c);
    if (S.screen === "detail") return detailKey(c);
    if (S.screen === "player") return playerKey(c);
  }

  // OK на экране входа = «смотреть без входа». Раньше OK перезапрашивал код,
  // и уйти с этого экрана можно было только кнопкой «назад» — на телевизоре
  // это неочевидно, человек упирался в экран входа и считал, что всё сломано.
  function loginKey(c) {
    // ГОСТЕВОГО ВХОДА БОЛЬШЕ НЕТ.
    //
    // Раньше «ОК» на экране входа открывал каталог без учётной записи: человек
    // смотрел без рекламы и без подписки, а история никуда не сохранялась. В
    // большой обёртке такого нет, и здесь быть не должно.
    //
    // «ОК» теперь просто запрашивает новый код — на случай, если прежний
    // просрочился, пока искали телефон.
    if (c === K.OK) startLogin();
  }

  function homeKey(c) {
    var row = S.rows[S.focus.row];
    if (!row) return;
    if (c === K.RIGHT) { S.focus.col = Math.min(S.focus.col + 1, row.items.length - 1); renderHome(); }
    else if (c === K.LEFT) {
      if (S.focus.col === 0) { S.stack.push("home"); openSearch(); return; }
      S.focus.col--; renderHome();
    }
    else if (c === K.DOWN) { S.focus.row = Math.min(S.focus.row + 1, S.rows.length - 1); clampCol(); renderHome(); }
    else if (c === K.UP) { S.focus.row = Math.max(S.focus.row - 1, 0); clampCol(); renderHome(); }
    else if (c === K.OK) {
      var it = row.items[S.focus.col];
      if (!it) return;
      S.stack.push("home");
      if (it.__search) { openSearch(); return; }
      if (it.__logout) { выйтиИзАккаунта(); return; }
      openDetail(it);
    }
  }
  function clampCol() {
    var row = S.rows[S.focus.row];
    S.focus.col = Math.min(S.focus.col, Math.max(0, (row ? row.items.length : 1) - 1));
  }

  function openSearch() {
    show("search");
    S.kb = { row: 0, col: 0 };
    renderSearch();
  }

  function searchKey(c) {
    if (S.kb.row === -1) {
      if (c === K.RIGHT) S.kb.col = Math.min(S.kb.col + 1, S.results.length - 1);
      else if (c === K.LEFT) S.kb.col = Math.max(S.kb.col - 1, 0);
      else if (c === K.UP) { S.kb.row = keys().length - 1; S.kb.col = 0; }
      else if (c === K.OK) { var it = S.results[S.kb.col]; if (it) { S.stack.push("search"); openDetail(it); return; } }
      renderSearch(); return;
    }
    var rows = keys(), rowKeys = rows[S.kb.row];
    if (c === K.RIGHT) S.kb.col = Math.min(S.kb.col + 1, rowKeys.length - 1);
    else if (c === K.LEFT) S.kb.col = Math.max(S.kb.col - 1, 0);
    else if (c === K.UP) { S.kb.row = Math.max(S.kb.row - 1, 0); S.kb.col = Math.min(S.kb.col, rows[S.kb.row].length - 1); }
    else if (c === K.DOWN) {
      if (S.kb.row === rows.length - 1 && S.results.length) { S.kb.row = -1; S.kb.col = 0; }
      else { S.kb.row = Math.min(S.kb.row + 1, rows.length - 1); S.kb.col = Math.min(S.kb.col, rows[S.kb.row].length - 1); }
    } else if (c === K.OK) {
      var k = rowKeys[S.kb.col];
      if (k === "ПРОБЕЛ") S.query += " ";
      else if (k === "СТЕРЕТЬ") S.query = S.query.slice(0, -1);
      else if (k === "ABC" || k === "АБВ") { S.kbLayout = S.kbLayout === 0 ? 1 : 0; S.kb.col = 0; }
      else S.query += k;
      runSearch();
    }
    renderSearch();
  }

  function detailKey(c) {
    var type = typeOf(S.detail);
    if (S.detailZone === "buttons") {
      var кнопок = (S.detailBtns || ["play", "fav"]).length;
      if (c === K.RIGHT) { S.detailFocus = Math.min(S.detailFocus + 1, кнопок - 1); renderDetail(); }
      else if (c === K.LEFT) { S.detailFocus = Math.max(S.detailFocus - 1, 0); renderDetail(); }
      else if (c === K.DOWN) {
        if (type === "tv" && S.seasons.length) { S.detailZone = "seasons"; S.detailFocus = indexOfSeason(); }
        else return;
        renderDetail();
      } else if (c === K.OK) {
        var что = (S.detailBtns || ["play", "fav"])[S.detailFocus];
        if (что === "play" || что === "restart") {
          S.stack.push("detail");
          // «Сначала» — тот же запуск, но без подхвата сохранённого места.
          S.playFromStart = (что === "restart");
          if (type === "tv") startPlayback(S.detail, S.season, episodeNumber());
          else startPlayback(S.detail, 0, 0);
          startSaving();
        } else {
          toggleFav(S.detail, type);
          renderDetail();
          toast(isFav(S.detail.id, type) ? "Добавлено в избранное" : "Убрано из избранного");
        }
      }
      return;
    }
    if (S.detailZone === "seasons") {
      if (c === K.RIGHT) { S.detailFocus = Math.min(S.detailFocus + 1, S.seasons.length - 1); renderDetail(); }
      else if (c === K.LEFT) { S.detailFocus = Math.max(S.detailFocus - 1, 0); renderDetail(); }
      else if (c === K.UP) { S.detailZone = "buttons"; S.detailFocus = 0; renderDetail(); }
      else if (c === K.DOWN) { if (S.episodes.length) { S.detailZone = "episodes"; S.epFocus = 0; renderDetail(); } }
      else if (c === K.OK) { S.season = S.seasons[S.detailFocus]; loadEpisodes(S.season); }
      return;
    }
    if (S.detailZone === "episodes") {
      if (c === K.DOWN) { S.epFocus = Math.min(S.epFocus + 1, S.episodes.length - 1); renderDetail(); }
      else if (c === K.UP) {
        if (S.epFocus === 0) { S.detailZone = "seasons"; S.detailFocus = indexOfSeason(); }
        else S.epFocus--;
        renderDetail();
      } else if (c === K.OK) {
        var ep = S.episodes[S.epFocus];
        if (!ep) return;
        S.stack.push("detail");
        startPlayback(S.detail, S.season, ep.episode_number);
        startSaving();
      }
    }
  }
  function indexOfSeason() {
    for (var i = 0; i < S.seasons.length; i++) if (S.seasons[i] === S.season) return i;
    return 0;
  }

  function playerKey(c) {
    var v = el("video");

    // Настройки: вкладки сверху, список под ними.
    if (S.play.overlay === "settings") {
      if (S.play.zone === "tabs") {
        if (c === K.RIGHT || c === K.LEFT) {
          S.play.tab = S.play.tab === 0 ? 1 : 0; S.play.setIdx = 0; renderSettings();
        } else if (c === K.DOWN) { S.play.zone = "list"; S.play.setIdx = 0; renderSettings(); }
        else if (c === K.OK) { S.play.zone = "list"; S.play.setIdx = 0; renderSettings(); }
        return;
      }
      if (c === K.DOWN) { S.play.setIdx = Math.min(S.play.setIdx + 1, settingsLen() - 1); renderSettings(); }
      else if (c === K.UP) {
        if (S.play.setIdx === 0) { S.play.zone = "tabs"; }
        else S.play.setIdx--;
        renderSettings();
      } else if (c === K.OK) {
        if (S.play.tab === 0) {
          S.play.overlay = "controls"; S.play.zone = "buttons";
          playTranslation(S.play.setIdx, false);
        } else {
          var qs = qualityList();
          S.play.quality = qs[S.play.setIdx];
          S.play.overlay = "controls"; S.play.zone = "buttons";
          playTranslation(S.play.tr, false);
        }
        renderSettings(); renderControls(); armHide();
      }
      return;
    }

    // Кнопка «Пропустить заставку» перехватывает OK, пока висит.
    if (S.play.overlay === "none" && el("skip").className.indexOf("hidden") === -1 && c === K.OK) {
      if (S.play.skipTime && S.play.skipTime.end) {
        try { v.currentTime = S.play.skipTime.end; } catch (e) {}
      }
      hideSkip();
      return;
    }

    // Панель скрыта: любая стрелка/OK её показывает, перемотка работает вслепую.
    if (S.play.overlay === "none") {
      if (c === K.OK || c === K.UP || c === K.DOWN) { flashOverlay(); return; }
      if (c === K.RIGHT || c === K.FWD) { seek(10); flashOverlay(); return; }
      if (c === K.LEFT || c === K.REW) { seek(-10); flashOverlay(); return; }
      if (c === K.PLAY || c === K.PLAYPAUSE || c === K.PAUSE) { togglePlay(); flashOverlay(); return; }
      return;
    }

    // Панель видна.
    armHide();
    if (S.play.zone === "timeline") {
      if (c === K.RIGHT || c === K.FWD) { seek(10); }
      else if (c === K.LEFT || c === K.REW) { seek(-10); }
      else if (c === K.DOWN) { S.play.zone = "buttons"; renderControls(); }
      else if (c === K.OK) { togglePlay(); }
      return;
    }
    // Зона кнопок.
    if (c === K.RIGHT) { S.play.ctrl = Math.min(S.play.ctrl + 1, CBTN.length - 1); renderControls(); }
    else if (c === K.LEFT) { S.play.ctrl = Math.max(S.play.ctrl - 1, 0); renderControls(); }
    else if (c === K.UP) { S.play.zone = "timeline"; renderControls(); }
    else if (c === K.PLAY || c === K.PLAYPAUSE || c === K.PAUSE) { togglePlay(); }
    else if (c === K.OK) {
      if (S.play.ctrl === 0) seek(-10);
      else if (S.play.ctrl === 1) togglePlay();
      else if (S.play.ctrl === 2) seek(10);
      else if (S.play.ctrl === 3) {
        S.play.overlay = "settings"; S.play.zone = "tabs"; S.play.tab = 0; S.play.setIdx = 0;
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
        el("controls").className = "controls hidden";
        renderSettings();
      }
      else if (S.play.ctrl === 4) { stopPlayback(); show("detail"); renderDetail(); }
    }
  }

  function goBack() {
    if (S.screen === "player") {
      // «Назад» сначала сворачивает то, что открыто, и только потом выходит.
      if (S.play.overlay === "settings") { S.play.overlay = "controls"; S.play.zone = "buttons"; renderSettings(); renderControls(); armHide(); return; }
      if (S.play.overlay === "controls") { S.play.overlay = "none"; hideOverlay(); return; }
      stopPlayback(); show("detail"); renderDetail(); return;
    }
    if (S.screen === "detail") { var p = S.stack.pop(); show(p === "search" ? "search" : "home"); if (p !== "search") renderHome(); return; }
    if (S.screen === "search") { show("home"); renderHome(); return; }
    // На экране входа «назад» никуда не ведёт: выходить в каталог без учётной
    // записи нельзя, см. loginKey.
    if (S.screen === "login") return;
    try { if (window.tizen && window.tizen.application) window.tizen.application.getCurrentApplication().exit(); } catch (e) {}
    try { window.close(); } catch (e) {}
  }

  // ── Старт ───────────────────────────────────────────────────────────────
  document.addEventListener("keydown", onKey, false);
  S.history = lsGet("kino_history", []);
  S.favorites = lsGet("kino_favorites", []);
  // ── ПОДГОНКА ХОЛСТА ПОД ЭКРАН ──────────────────────────────────────
  //
  // Клиент нарисован жёстким холстом 1280x720 в расчёте на то, что телевизор
  // растянет его сам. Samsung не растягивает: картинка занимала верхний левый
  // угол, остальное чёрное — «не на весь экран» на фото Егора.
  //
  // Поэтому растягиваем сами. Заодно оставляем запас на срезаемые края
  // (overscan): холст ужимаем до 94% и сдвигаем на 3% — это тот самый отступ,
  // который в стилях задать нельзя, там его стирает общее правило.
  function подогнатьХолст() {
    try {
      var окноШ = window.innerWidth || 1280;
      var окноВ = window.innerHeight || 720;
      // Холст растягиваем РОВНО по экрану, без запаса по краям.
      //
      // Запас в 6%, потом в 3% Егор видел как чёрные поля снизу и по бокам.
      // Безопасный отступ и так есть внутри: у каждого экрана свои поля
      // (.screen в стилях), они и уводят содержимое от края.
      var запас = 1;
      var kx = (окноШ / 1280) * запас;
      var ky = (окноВ / 720) * запас;
      var сдвигX = 0;
      var сдвигY = 0;
      var app = el("app");
      if (!app) return;
      var правило = "translate(" + сдвигX + "px," + сдвигY + "px) scale(" + kx + "," + ky + ")";
      app.style.transformOrigin = "0 0";
      app.style.webkitTransformOrigin = "0 0";
      app.style.transform = правило;
      app.style.webkitTransform = правило;
    } catch (e) {}
  }
  подогнатьХолст();
  if (window.addEventListener) window.addEventListener("resize", подогнатьХолст);

  S.user = lsGet("user", null);
  if (S.user && S.user.email) {
    show("home");
    el("who").innerHTML = esc(S.user.name || S.user.email);
    pullSync(function () { enterHome(); });
  } else {
    startLogin();
  }
})();
