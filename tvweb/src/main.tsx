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

createRoot(document.getElementById("root")!).render(<App />);
