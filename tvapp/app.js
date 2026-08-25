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
    play: { item: null, season: 0, episode: 0, translations: [], tr: 0, quality: "", panel: null, panelFocus: 0 },
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
  function typeOf(o) { return o.type ? o.type : (o.title ? "movie" : "tv"); }
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
    rows.push({ title: "Сейчас в тренде", items: [] });
    rows.push({ title: "Популярные сериалы", items: [] });
    rows.push({ title: "Новинки", items: [] });
    S.rows = rows;
    S.focus = { row: 0, col: 0 };
    renderHome();

    var base = rows.length - 3;
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
  function firstMirror(u) { return String(u || "").split(" or ")[0]; }

  var QORDER = ["2160", "1440", "1080", "1080p", "720", "720p", "480", "480p", "360", "360p"];
  function pickQuality(q, want) {
    if (want && q[want]) return { url: q[want], q: want };
    for (var i = 0; i < QORDER.length; i++) if (q[QORDER[i]]) return { url: q[QORDER[i]], q: QORDER[i] };
    for (var k in q) if (q.hasOwnProperty(k)) return { url: q[k], q: k };
    return null;
  }

  function startPlayback(item, season, episode) {
    S.play.item = item; S.play.season = season || 0; S.play.episode = episode || 0;
    S.play.translations = []; S.play.tr = 0; S.play.panel = null;
    show("player");
    msg("Ищу источник…");
    var type = typeOf(item);
    tmdb("/" + type + "/" + item.id + "/external_ids", {}, function (ids) {
      var imdb = ids && ids.imdb_id;
      if (!imdb) { msg("У этого тайтла нет кода IMDb — источник его не найдёт."); return; }
      var tail = (type === "tv" ? "&season=" + (season || 1) + "&episode=" + (episode || 1) : "");
      get(RESOLVE + "/alloha-hls?imdb=" + encodeURIComponent(imdb) + "&type=" + type + tail, function (d) {
        var tr = d && d.translations;
        if (tr && tr.length) { onTranslations(tr); return; }
        // Alloha молчит — идём во второй источник, как это делает сайт.
        msg("Основной источник молчит, пробую запасной…");
        get(RESOLVE + "/cdnhub?imdb=" + encodeURIComponent(imdb) + "&type=" + type + tail, function (d2) {
          var tr2 = d2 && d2.translations;
          if (tr2 && tr2.length) { onTranslations(tr2); return; }
          msg("Этого " + (type === "tv" ? "эпизода" : "фильма") + " сейчас нет ни у одного источника.");
        });
      });
    });
  }

  function onTranslations(list) {
    S.play.translations = list;
    // Держим озвучку между сериями по ИМЕНИ: индексы между эпизодами не совпадают.
    var want = lsGet("kino_tv_tr_" + S.play.item.id, null);
    var idx = 0;
    if (want) {
      for (var i = 0; i < list.length; i++) {
        if (String(list[i].name).toLowerCase() === String(want).toLowerCase()) { idx = i; break; }
      }
    }
    S.play.tr = idx;
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
      resumeAt = v.currentTime || 0;      // смена озвучки/качества — не терять место
    }
    msg("Загружаю…");
    v.src = firstMirror(pick.url);
    v.onloadedmetadata = function () {
      if (resumeAt > 0 && resumeAt < (v.duration || 1e9)) {
        try { v.currentTime = resumeAt; } catch (e) {}
      }
      msg("");
      try { v.play(); } catch (e) {}
    };
    v.onerror = function () {
      // Samsung и LG играют HLS сами, Android-WebView — нет.
      msg("Телевизор не смог открыть этот поток. Нажмите OK и выберите другую озвучку.");
    };
    renderPlayerBar();
  }

  function msg(t) { el("player-msg").innerHTML = t ? esc(t) : ""; }

  function renderPlayerBar() {
    var t = S.play.translations[S.play.tr];
    var item = S.play.item;
    var sub = "";
    if (typeOf(item) === "tv" && S.play.season) sub = " · S" + S.play.season + "E" + S.play.episode;
    el("player-bar").innerHTML =
      '<b>' + esc(titleOf(item)) + "</b>" + esc(sub) +
      '  <span class="dim">озвучка:</span> ' + esc(t ? t.name : "—") +
      '  <span class="dim">качество:</span> ' + esc(S.play.quality || "—") +
      '  <span class="dim">OK — меню</span>';
  }

  function renderPanel() {
    var p = S.play.panel;
    if (!p) { el("player-panel").className = "panel hidden"; return; }
    var h = "", i;
    if (p === "menu") {
      var opts = ["Озвучка", "Качество", "Продолжить просмотр"];
      for (i = 0; i < opts.length; i++) {
        h += '<div class="pitem' + (S.play.panelFocus === i ? " focused" : "") + '">' + esc(opts[i]) + "</div>";
      }
    } else if (p === "tr") {
      for (i = 0; i < S.play.translations.length; i++) {
        h += '<div class="pitem' + (S.play.panelFocus === i ? " focused" : "") +
             (i === S.play.tr ? " current" : "") + '">' + esc(S.play.translations[i].name) + "</div>";
      }
    } else if (p === "q") {
      var qs = qualityList();
      for (i = 0; i < qs.length; i++) {
        h += '<div class="pitem' + (S.play.panelFocus === i ? " focused" : "") +
             (qs[i] === S.play.quality ? " current" : "") + '">' + esc(qs[i]) + "</div>";
      }
    }
    el("player-panel").innerHTML = h;
    el("player-panel").className = "panel";
  }
  function qualityList() {
    var t = S.play.translations[S.play.tr] || {};
    var q = t.quality || {}, out = [];
    for (var i = 0; i < QORDER.length; i++) if (q[QORDER[i]]) out.push(QORDER[i]);
    if (!out.length) for (var k in q) if (q.hasOwnProperty(k)) out.push(k);
    return out;
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
    S.play.panel = null;
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
    if (S.play.panel) {
      var len = S.play.panel === "menu" ? 3 : (S.play.panel === "tr" ? S.play.translations.length : qualityList().length);
      if (c === K.DOWN) { S.play.panelFocus = Math.min(S.play.panelFocus + 1, len - 1); renderPanel(); }
      else if (c === K.UP) { S.play.panelFocus = Math.max(S.play.panelFocus - 1, 0); renderPanel(); }
      else if (c === K.OK) {
        if (S.play.panel === "menu") {
          if (S.play.panelFocus === 0) { S.play.panel = "tr"; S.play.panelFocus = S.play.tr; }
          else if (S.play.panelFocus === 1) { S.play.panel = "q"; S.play.panelFocus = 0; }
          else { S.play.panel = null; try { v.play(); } catch (e) {} }
        } else if (S.play.panel === "tr") {
          S.play.panel = null; playTranslation(S.play.panelFocus, false);
        } else {
          var qs = qualityList();
          S.play.quality = qs[S.play.panelFocus];
          S.play.panel = null; playTranslation(S.play.tr, false);
        }
        renderPanel(); renderPlayerBar();
      }
      return;
    }
    if (c === K.OK) { S.play.panel = "menu"; S.play.panelFocus = 0; try { v.pause(); } catch (e) {} renderPanel(); }
    else if (c === K.PLAY || c === K.PLAYPAUSE || c === K.PAUSE) { if (v.paused) { try { v.play(); } catch (e) {} } else v.pause(); }
    else if (c === K.RIGHT || c === K.FWD) { try { v.currentTime = Math.min((v.currentTime || 0) + 10, v.duration || 0); } catch (e) {} }
    else if (c === K.LEFT || c === K.REW) { try { v.currentTime = Math.max((v.currentTime || 0) - 10, 0); } catch (e) {} }
  }

  function goBack() {
    if (S.screen === "player") {
      if (S.play.panel) { S.play.panel = null; renderPanel(); try { el("video").play(); } catch (e) {} return; }
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
