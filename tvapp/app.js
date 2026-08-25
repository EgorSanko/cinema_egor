/*
 * ТВ-клиент sapkeflykino. Только ES5 — код обязан выполниться на движке
 * телевизора 2016 года, где нет ни fetch, ни промисов, ни стрелочных функций.
 * Никаких сборщиков: файл кладётся на сервер как есть.
 */
(function () {
  "use strict";

  var TMDB_KEY = "275c9d09780aadb4b13ff57a731eda00";
  var TMDB = "/tmdb-api";               // тот же прокси, что у сайта: TMDB напрямую из РФ закрыт
  var IMG = "/tmdb-img";
  var RESOLVE = "https://kino.lead-seek.ru/hdrezka/api";

  // Коды кнопок «назад» отличаются на каждой платформе, и это не прихоть:
  // Tizen шлёт 10009, webOS — 461, Android TV — обычный Backspace/Escape.
  var K = { LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, OK: 13, BACK: 8, ESC: 27, TIZEN_BACK: 10009, WEBOS_BACK: 461 };

  var state = {
    screen: "home",
    rows: [],          // [{title, items:[]}]
    focus: { row: 0, col: 0 },
    query: "",
    kb: { row: 0, col: 0 },
    results: [],
    detail: null,
    detailBtn: 0,
    history: []
  };

  // ── Сеть ────────────────────────────────────────────────────────────────
  function xhr(url, cb) {
    var r = new XMLHttpRequest();
    r.open("GET", url, true);
    r.timeout = 25000;
    r.onreadystatechange = function () {
      if (r.readyState !== 4) return;
      if (r.status >= 200 && r.status < 300) {
        var data = null;
        try { data = JSON.parse(r.responseText); } catch (e) { data = null; }
        cb(data);
      } else {
        cb(null);
      }
    };
    r.ontimeout = function () { cb(null); };
    r.onerror = function () { cb(null); };
    r.send();
  }

  function tmdb(path, params, cb) {
    var q = "api_key=" + TMDB_KEY + "&language=ru-RU";
    for (var k in params) {
      if (params.hasOwnProperty(k)) q += "&" + k + "=" + encodeURIComponent(params[k]);
    }
    xhr(TMDB + path + "?" + q, cb);
  }

  // ── Мелкие помощники ────────────────────────────────────────────────────
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function poster(p) {
    return p ? IMG + "/w342" + p : "";
  }
  function titleOf(o) { return o.title || o.name || ""; }
  function yearOf(o) { return String(o.release_date || o.first_air_date || "").slice(0, 4); }
  function typeOf(o) { return o.title ? "movie" : "tv"; }

  var toastTimer = null;
  function toast(msg) {
    var t = el("toast");
    t.innerHTML = esc(msg);
    t.className = "toast";
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = "toast hidden"; }, 3500);
  }

  function show(name) {
    var ids = ["home", "search", "detail", "player"];
    for (var i = 0; i < ids.length; i++) {
      el("screen-" + ids[i]).className = ids[i] === name ? "screen" : "screen hidden";
    }
    state.screen = name;
  }

  // ── Экран «Главная» ─────────────────────────────────────────────────────
  function loadHome() {
    var pending = 2;
    var rows = [
      { title: "Сейчас в тренде", items: [] },
      { title: "Популярные сериалы", items: [] }
    ];
    function done() {
      pending--;
      if (pending > 0) return;
      rows.push({ title: "Поиск", items: [{ __search: true }] });
      state.rows = rows;
      renderHome();
    }
    tmdb("/trending/movie/week", {}, function (d) {
      rows[0].items = (d && d.results ? d.results : []).slice(0, 18);
      done();
    });
    tmdb("/tv/popular", {}, function (d) {
      rows[1].items = (d && d.results ? d.results : []).slice(0, 18);
      done();
    });
  }

  function cardHtml(item, focused) {
    if (item.__search) {
      return '<div class="card' + (focused ? " focused" : "") + '" style="line-height:236px;text-align:center;font-size:20px">Поиск</div>';
    }
    var img = poster(item.poster_path);
    return '<div class="card' + (focused ? " focused" : "") + '">' +
      (img ? '<img src="' + esc(img) + '" alt="">' : "") +
      '<div class="cap">' + esc(titleOf(item)) + "</div></div>";
  }

  function renderHome() {
    var h = "";
    for (var r = 0; r < state.rows.length; r++) {
      var row = state.rows[r];
      h += '<div class="row"><div class="row-title">' + esc(row.title) + '</div><div class="row-strip">';
      for (var c = 0; c < row.items.length; c++) {
        h += cardHtml(row.items[c], r === state.focus.row && c === state.focus.col);
      }
      h += "</div></div>";
    }
    el("rows").innerHTML = h;
    scrollRowIntoView();
  }

  // Сдвигаем ленту так, чтобы карточка в фокусе была видна.Старые телевизоры не
  // умеют scrollIntoView с опциями, поэтому считаем сдвиг сами.
  function scrollRowIntoView() {
    var strips = el("rows").getElementsByClassName("row-strip");
    var strip = strips[state.focus.row];
    if (!strip) return;
    var CARD = 152 + 14;
    var shift = Math.max(0, (state.focus.col - 3) * CARD);
    for (var i = 0; i < strips.length; i++) {
      strips[i].firstChild && (strips[i].style.marginLeft = "0px");
    }
    strip.style.marginLeft = "-" + shift + "px";
  }

  // ── Экран «Поиск» ───────────────────────────────────────────────────────
  var KEYS = [
    "АБВГДЕЁЖЗИЙ".split(""),
    "КЛМНОПРСТУФ".split(""),
    "ХЦЧШЩЪЫЬЭЮЯ".split(""),
    "0123456789".split(""),
    ["ПРОБЕЛ", "СТЕРЕТЬ"]
  ];

  function renderKeyboard() {
    var h = "";
    for (var r = 0; r < KEYS.length; r++) {
      h += '<div class="krow">';
      for (var c = 0; c < KEYS[r].length; c++) {
        var f = (state.kb.row === r && state.kb.col === c) ? " focused" : "";
        h += '<div class="key' + f + '">' + esc(KEYS[r][c]) + "</div>";
      }
      h += "</div>";
    }
    el("keyboard").innerHTML = h;
    el("query").innerHTML = state.query ? esc(state.query) : "&nbsp;";
  }

  function renderResults() {
    var h = "";
    for (var i = 0; i < state.results.length; i++) {
      h += cardHtml(state.results[i], state.kb.row === -1 && state.kb.col === i);
    }
    el("results").innerHTML = h || "";
  }

  var searchTimer = null;
  function runSearch() {
    if (searchTimer) clearTimeout(searchTimer);
    if (state.query.length < 2) { state.results = []; renderResults(); return; }
    searchTimer = setTimeout(function () {
      var q = state.query;
      var pending = 2, movies = [], tv = [];
      function done() {
        pending--;
        if (pending > 0) return;
        // Чередуем фильмы и сериалы. Тот же урок, что и на сайте: при склейке
        // «сначала все фильмы» сериалы уезжали за предел показа и пропадали.
        var out = [];
        for (var i = 0; i < Math.max(movies.length, tv.length); i++) {
          if (i < movies.length) out.push(movies[i]);
          if (i < tv.length) out.push(tv[i]);
        }
        state.results = out.slice(0, 24);
        renderResults();
      }
      tmdb("/search/movie", { query: q }, function (d) {
        movies = (d && d.results ? d.results : []).slice(0, 12); done();
      });
      tmdb("/search/tv", { query: q }, function (d) {
        tv = (d && d.results ? d.results : []).slice(0, 12); done();
      });
    }, 400);
  }

  // ── Карточка тайтла ─────────────────────────────────────────────────────
  function openDetail(item) {
    state.detail = item;
    state.detailBtn = 0;
    var img = poster(item.poster_path);
    var meta = yearOf(item) + (typeOf(item) === "tv" ? " · сериал" : " · фильм");
    el("detail").innerHTML =
      (img ? '<img class="detail-poster" src="' + esc(img) + '" alt="">' : '<div class="detail-poster"></div>') +
      '<div class="detail-info">' +
        '<div class="detail-title">' + esc(titleOf(item)) + "</div>" +
        '<div class="detail-meta">' + esc(meta) + "</div>" +
        '<div class="detail-text">' + esc(item.overview || "Описание пока не добавлено.") + "</div>" +
        '<div><span class="btn focused" id="btn-play">Смотреть</span>' +
        '<span class="btn secondary" id="btn-back">Назад</span></div>' +
      "</div>";
    show("detail");
  }

  function renderDetailFocus() {
    var p = el("btn-play"), b = el("btn-back");
    if (!p || !b) return;
    p.className = "btn" + (state.detailBtn === 0 ? " focused" : "");
    b.className = "btn secondary" + (state.detailBtn === 1 ? " focused" : "");
  }

  // ── Плеер ───────────────────────────────────────────────────────────────
  // Первое зеркало из строки вида "https://A... or https://B...":
  // Alloha отдаёт пару, и мёртвое зеркало = тайтл не играет.
  function firstMirror(u) { return String(u || "").split(" or ")[0]; }

  function bestQuality(q) {
    var order = ["1080", "1080p", "720", "720p", "480", "480p", "360", "2160"];
    for (var i = 0; i < order.length; i++) if (q[order[i]]) return q[order[i]];
    for (var k in q) if (q.hasOwnProperty(k)) return q[k];
    return null;
  }

  function play(item) {
    show("player");
    el("player-msg").innerHTML = "Загружаю…";
    var type = typeOf(item);
    tmdb("/" + type + "/" + item.id + "/external_ids", {}, function (ids) {
      var imdb = ids && ids.imdb_id;
      if (!imdb) { el("player-msg").innerHTML = "У этого тайтла нет кода IMDb — источник его не найдёт."; return; }
      var url = RESOLVE + "/alloha-hls?imdb=" + encodeURIComponent(imdb) + "&type=" + type;
      if (type === "tv") url += "&season=1&episode=1";
      xhr(url, function (d) {
        var tr = d && d.translations;
        if (!tr || !tr.length) {
          // Alloha молчит — пробуем второй источник, как это делает сайт.
          xhr(RESOLVE + "/cdnhub?imdb=" + encodeURIComponent(imdb) + "&type=" + type +
              (type === "tv" ? "&season=1&episode=1" : ""), function (d2) {
            var tr2 = d2 && d2.translations;
            if (!tr2 || !tr2.length) {
              el("player-msg").innerHTML = "Этого тайтла сейчас нет ни у одного источника.";
              return;
            }
            startVideo(bestQuality(tr2[0].quality || {}));
          });
          return;
        }
        startVideo(bestQuality(tr[0].quality || {}));
      });
    });
  }

  function startVideo(u) {
    if (!u) { el("player-msg").innerHTML = "Источник не отдал ссылку на поток."; return; }
    var v = el("video");
    v.src = firstMirror(u);
    el("player-msg").innerHTML = "";
    v.onerror = function () {
      // Телевизоры Samsung и LG играют HLS сами; Android-WebView — нет.
      // Для него позже подключим отдельный проигрыватель.
      el("player-msg").innerHTML = "Этот телевизор не смог открыть поток.";
    };
    try { v.play(); } catch (e) { /* автозапуск может быть запрещён — сработает по OK */ }
  }

  function stopVideo() {
    var v = el("video");
    try { v.pause(); } catch (e) {}
    v.removeAttribute("src");
    try { v.load(); } catch (e) {}
  }

  // ── Управление пультом ──────────────────────────────────────────────────
  function onKey(e) {
    var code = e.keyCode;
    if (code === K.TIZEN_BACK || code === K.WEBOS_BACK || code === K.BACK || code === K.ESC) {
      e.preventDefault();
      goBack();
      return;
    }
    if (state.screen === "home") return homeKey(code);
    if (state.screen === "search") return searchKey(code);
    if (state.screen === "detail") return detailKey(code);
    if (state.screen === "player") return playerKey(code);
  }

  function homeKey(code) {
    var row = state.rows[state.focus.row];
    if (!row) return;
    if (code === K.RIGHT) { state.focus.col = Math.min(state.focus.col + 1, row.items.length - 1); renderHome(); }
    else if (code === K.LEFT) { state.focus.col = Math.max(state.focus.col - 1, 0); renderHome(); }
    else if (code === K.DOWN) {
      state.focus.row = Math.min(state.focus.row + 1, state.rows.length - 1);
      state.focus.col = Math.min(state.focus.col, state.rows[state.focus.row].items.length - 1);
      renderHome();
    } else if (code === K.UP) {
      state.focus.row = Math.max(state.focus.row - 1, 0);
      state.focus.col = Math.min(state.focus.col, state.rows[state.focus.row].items.length - 1);
      renderHome();
    } else if (code === K.OK) {
      var item = row.items[state.focus.col];
      if (!item) return;
      if (item.__search) { state.history.push("home"); show("search"); renderKeyboard(); renderResults(); return; }
      state.history.push("home");
      openDetail(item);
    }
  }

  function searchKey(code) {
    if (state.kb.row === -1) {              // фокус в результатах
      if (code === K.RIGHT) state.kb.col = Math.min(state.kb.col + 1, state.results.length - 1);
      else if (code === K.LEFT) state.kb.col = Math.max(state.kb.col - 1, 0);
      else if (code === K.UP) { state.kb.row = KEYS.length - 1; state.kb.col = 0; }
      else if (code === K.OK) {
        var it = state.results[state.kb.col];
        if (it) { state.history.push("search"); openDetail(it); return; }
      }
      renderKeyboard(); renderResults();
      return;
    }
    var rowKeys = KEYS[state.kb.row];
    if (code === K.RIGHT) state.kb.col = Math.min(state.kb.col + 1, rowKeys.length - 1);
    else if (code === K.LEFT) state.kb.col = Math.max(state.kb.col - 1, 0);
    else if (code === K.UP) { state.kb.row = Math.max(state.kb.row - 1, 0); state.kb.col = Math.min(state.kb.col, KEYS[state.kb.row].length - 1); }
    else if (code === K.DOWN) {
      if (state.kb.row === KEYS.length - 1 && state.results.length) { state.kb.row = -1; state.kb.col = 0; }
      else { state.kb.row = Math.min(state.kb.row + 1, KEYS.length - 1); state.kb.col = Math.min(state.kb.col, KEYS[state.kb.row].length - 1); }
    } else if (code === K.OK) {
      var k = rowKeys[state.kb.col];
      if (k === "ПРОБЕЛ") state.query += " ";
      else if (k === "СТЕРЕТЬ") state.query = state.query.slice(0, -1);
      else state.query += k;
      runSearch();
    }
    renderKeyboard(); renderResults();
  }

  function detailKey(code) {
    if (code === K.RIGHT) { state.detailBtn = 1; renderDetailFocus(); }
    else if (code === K.LEFT) { state.detailBtn = 0; renderDetailFocus(); }
    else if (code === K.OK) {
      if (state.detailBtn === 0) { state.history.push("detail"); play(state.detail); }
      else goBack();
    }
  }

  function playerKey(code) {
    var v = el("video");
    if (code === K.OK) { if (v.paused) { try { v.play(); } catch (e) {} } else v.pause(); }
  }

  function goBack() {
    if (state.screen === "player") { stopVideo(); show("detail"); return; }
    var prev = state.history.pop();
    if (state.screen === "detail") { show(prev === "search" ? "search" : "home"); return; }
    if (state.screen === "search") { show("home"); return; }
    // На главной «назад» закрывает приложение — на Tizen/webOS это штатный выход.
    try { if (window.tizen && window.tizen.application) window.tizen.application.getCurrentApplication().exit(); } catch (e) {}
    try { window.close(); } catch (e) {}
  }

  // ── Старт ───────────────────────────────────────────────────────────────
  document.addEventListener("keydown", onKey, false);
  show("home");
  loadHome();
})();
