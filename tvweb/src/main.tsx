import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Ловушка ошибок: на телевизоре нет консоли, и «чёрный экран» неотличим от
// «приложение не запустилось». Ошибку шлём себе картинкой — этот способ
// переживает любые ограничения на запросы.
window.onerror = function (m, src, line, col) {
  try {
    var i = new Image();
    i.src = "/tv-error?m=" + encodeURIComponent("tvweb: " + String(m).slice(0, 220)) +
            "&x=" + encodeURIComponent(String(src || "") + ":" + line + ":" + col);
  } catch (e) {}
  return false;
};

// ЗАМОК ОТ ДВОЙНОГО ЗАПУСКА.
//
// Сборка отдаёт браузеру два приложения: современное (type="module") и старое
// (nomodule). Предполагается, что движок запустит РОВНО ОДНО. Телевизор Егора
// (Samsung, Tizen 5) запускал ОБА: они монтировались в один и тот же контейнер
// и дрались за него. На экране оставалось то, которое в сеть не ходило —
// счётчик показывал «запросов 0/0», хотя в логах сервера лежали честные пять
// ответов. Отсюда и вечное «Загружаю подборки».
//
// Кто успел первым — тот и работает, второй тихо уходит.
var w = window as any;
if (!w.__SAPKEFLY_TV_MOUNTED__) {
  w.__SAPKEFLY_TV_MOUNTED__ = true;
  createRoot(document.getElementById("root")!).render(<App />);
}
