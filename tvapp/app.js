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

  var TMDB_KEY = "275c9d09780aadb4b13ff57a731eda00";
  var TMDB = "/tmdb-api";
  var IMG = "/tmdb-img";
  var RESOLVE = "https://kino.lead-seek.ru/hdrezka/api";
  var ORIGIN = window.location.protocol + "//" + window.location.host;

  // Коды «назад» у каждой платформы свои: Tizen 10009, webOS 461, Android — Esc.
  var K = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 8, ESC: 27, TIZEN_BACK: 10009, WEBOS_BACK: 461,
            PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FWD: 417, REW: 412 };

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
  // ВАЖНО: доверяем полю type ТОЛЬКО если это наш "movie"/"tv". У TMDB в
  // подробных данных сериала есть СВОЁ поле type со значением вроде "Scripted",
  // и наивная проверка подставляла его в адрес запроса: получалось
  // /tmdb-api/Scripted/2316/external_ids → 404, из-за чего у ВСЕХ сериалов не
  // грузились ни сезоны, ни поток. Поймано прогоном в браузере.
  function typeOf(o) {
    if (o.type === "movie" || o.type === "tv") return o.type;
    return o.title ? "movie" : "tv";
  }
  // Источник отдаёт озвучку технической строкой вида
  // «(rus) AC3 20 @ 192 kbps - MVO 2x2 / Kravec». На телевизоре это нечитаемо,
  // поэтому оставляем то, что человек и называет озвучкой: студию после тире.
  // Если после чистки имена совпали (у сериалов бывает две дорожки с одним
  // названием) — нумеруем, иначе в списке два одинаковых пункта.
  function dubName(raw) {
    var s = String(raw || "").replace(/^\s*\((?:rus|ru|eng|ukr|[a-z]{2,3})\)\s*/i, "");
    var dash = s.lastIndexOf(" - ");
    if (dash > -1) s = s.slice(dash + 3);
    s = s.replace(/\b(AC3|AAC|E-?AC3|DTS|MP3)\b/gi, "")
         .replace(/\d+\s*@\s*\d+\s*kbps/gi, "")
         .replace(/\s{2,}/g, " ").trim();
    return s || String(raw || "").trim() || "Дорожка";
  }
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

  // ── Вход по коду ────────────────────────────────────────────────────────
  var pollTimer = null;
  function startLogin() {
    show("login");
    el("login-box").innerHTML = '<div class="login-title">Вход</div><div class="login-hint">Получаю код…</div>';
    post("/api/tv-link", { action: "create", intent: "tv" }, function (d) {
      if (!d || !d.code) {
        el("login-box").innerHTML =
          '<div class="login-title">Вход</div>' +
          '<div class="login-hint">Не получилось получить код. Нажмите OK, чтобы повторить, ' +
          'или «назад» — и смотрите без входа.</div>';
        return;
      }
      var url = ORIGIN + "/link/" + d.code;
      el("login-box").innerHTML =
        '<div class="login-title">Вход</div>' +
        '<div class="login-code">' + esc(d.code) + "</div>" +
        '<div class="login-hint">Откройте на телефоне<br><b>' + esc(url) + "</b><br>" +
        "и подтвердите вход. Код живёт несколько минут.<br><br>" +
        "Кнопка «назад» — смотреть без входа.</div>";
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
    for (var i = 0; i < S.history.length && items.length < 16; i++) {
      var h = S.history[i];
      var pos = getPosition(h.id, h.type, h.season, h.episode);
      if (!pos || !pos.time) continue;
      items.push({
        id: h.id, title: h.title, name: h.title, poster_path: h.poster_path,
        type: h.type, __resume: pos.time, __season: h.season, __episode: h.episode
      });
    }
    return items;
  }

  function enterHome() {
    show("home");
    el("who").innerHTML = S.user ? esc(S.user.name || S.user.email) : "Гость";
    loadHome();
  }

  function loadHome() {
    var rows = [];
    var cont = continueRow();
    if (cont.length) rows.push({ title: "Продолжить просмотр", items: cont });
    if (S.favorites.length) rows.push({ title: "Избранное", items: S.favorites.slice(0, 16) });
    rows.push({ title: "Найти фильм или сериал", items: [{ __search: true, title: "Поиск" }] });
    rows.push({ title: "Сейчас в тренде", items: [] });
    rows.push({ title: "Популярные сериалы", items: [] });
    rows.push({ title: "Новинки", items: [] });
    S.rows = rows;
    S.focus = { row: 0, col: 0 };
    renderHome();

    var base = rows.length - 3;  // три последних ряда догружаются с TMDB
    tmdb("/trending/movie/week", {}, function (d) {
      rows[base].items = (d && d.results ? d.results : []).slice(0, 18); renderHome();
    });
    tmdb("/tv/popular", {}, function (d) {
      rows[base + 1].items = (d && d.results ? d.results : []).slice(0, 18); renderHome();
    });
    tmdb("/movie/now_playing", {}, function (d) {
      rows[base + 2].items = (d && d.results ? d.results : []).slice(0, 18); renderHome();
    });
  }

  function cardHtml(item, focused) {
    if (item.__search) {
      return '<div class="card searchcard' + (focused ? " focused" : "") + '">' +
        '<div class="searchglyph">ПОИСК</div><div class="cap">Название фильма или сериала</div></div>';
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
      h += '<div class="row"><div class="row-title">' + esc(row.title) + "</div>";
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
      tmdb("/search/movie", { query: q }, function (d) { movies = (d && d.results ? d.results : []).slice(0, 12); done(); });
      tmdb("/search/tv", { query: q }, function (d) { tv = (d && d.results ? d.results : []).slice(0, 12); done(); });
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
    return out;
  }

  function loadEpisodes(season) {
    S.episodes = [];
    renderDetail();
    get("/api/tv-episodes?id=" + S.detail.id + "&season=" + season, function (d) {
      S.episodes = (d && d.length) ? d : [];
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

    var btns = '<div class="btns">' +
      '<span class="btn' + (S.detailZone === "buttons" && S.detailFocus === 0 ? " focused" : "") + '">' + esc(playLabel) + "</span>" +
      '<span class="btn secondary' + (S.detailZone === "buttons" && S.detailFocus === 1 ? " focused" : "") + '">' + esc(favLabel) + "</span>" +
      "</div>";

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
        epsHtml += '<div class="ep' + ef + '">' +
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
      eps.scrollTop = Math.max(0, (S.epFocus - 2) * 46);
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
      var p = getPosition(S.play.item.id, typeOf(S.play.item), S.play.season, S.play.episode);
      if (p && p.time > 5) resumeAt = p.time;
    } else {
      resumeAt = v.currentTime || 0;   // смена озвучки и качества не теряет место
    }
    msg("Загружаю…");
    v.src = firstMirror(pick.url);
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

  function seek(delta) {
    var v = el("video");
    if (!v.duration) return;
    try { v.currentTime = Math.max(0, Math.min(v.duration, (v.currentTime || 0) + delta)); } catch (e) {}
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
    if (c === K.TIZEN_BACK || c === K.WEBOS_BACK || c === K.BACK || c === K.ESC) { e.preventDefault(); goBack(); return; }
    if (S.screen === "login") return loginKey(c);
    if (S.screen === "home") return homeKey(c);
    if (S.screen === "search") return searchKey(c);
    if (S.screen === "detail") return detailKey(c);
    if (S.screen === "player") return playerKey(c);
  }

  function loginKey(c) { if (c === K.OK) startLogin(); }

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
      if (c === K.RIGHT) { S.detailFocus = Math.min(S.detailFocus + 1, 1); renderDetail(); }
      else if (c === K.LEFT) { S.detailFocus = Math.max(S.detailFocus - 1, 0); renderDetail(); }
      else if (c === K.DOWN) {
        if (type === "tv" && S.seasons.length) { S.detailZone = "seasons"; S.detailFocus = indexOfSeason(); }
        else return;
        renderDetail();
      } else if (c === K.OK) {
        if (S.detailFocus === 0) {
          S.stack.push("detail");
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
    if (S.screen === "login") { S.user = null; enterHome(); return; }
    try { if (window.tizen && window.tizen.application) window.tizen.application.getCurrentApplication().exit(); } catch (e) {}
    try { window.close(); } catch (e) {}
  }

  // ── Старт ───────────────────────────────────────────────────────────────
  document.addEventListener("keydown", onKey, false);
  S.history = lsGet("kino_history", []);
  S.favorites = lsGet("kino_favorites", []);
  S.user = lsGet("user", null);
  if (S.user && S.user.email) {
    show("home");
    el("who").innerHTML = esc(S.user.name || S.user.email);
    pullSync(function () { enterHome(); });
  } else {
    startLogin();
  }
})();
