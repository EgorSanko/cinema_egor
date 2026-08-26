import * as React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadRailsCb } from "@/lib/api";
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

  // Подборки грузим ДО запуска приложения, обычным кодом, не полагаясь на
  // эффекты React. На телевизоре Егора счётчик показывал «запросов 0/0» при
  // живой сети — то есть эффект, который эти запросы делает, не выполнялся
  // вовсе. Так приложение получает данные сразу и от эффектов не зависит.
  var el = document.getElementById("root")!;
  var root = createRoot(el);
  root.render(<App initialRails={null} booting />);
  // Колбэк, а не обещание: на телевизоре Егора Promise.all не разрешался
  // вовсе, и экран замирал на «готовлю подборки» без единой ошибки.
  loadRailsCb(function (rails) {
    root.render(<App initialRails={rails} />);
    // Отмечаемся живыми: по этой метке сторож в index.html понимает, что
    // выход рисовать не нужно.
    (window as any).__SAPKEFLY_TV_READY__ = true;
    // Строки проверки загрузки нужны, только пока приложение не запустилось.
    // Как дошли до подборок — убираем, иначе они висят поверх интерфейса.
    try {
      var b = document.getElementById("boot");
      if (b && b.parentNode) b.parentNode.removeChild(b);
    } catch (e) {}
  });
}
