import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import legacy from "@vitejs/plugin-legacy";
import path from "path";

/**
 * Сборка ТВ-обёртки под старые телевизоры.
 *
 * Зачем отдельная сборка, а не Next. Next 16 держит фиксированную современную
 * планку и browserslist для клиентского бандла игнорирует — проверено: после
 * чистой пересборки в чанках остаются `?.` и `??`. Плюс Tailwind 4 выдаёт
 * `color-mix` девятьсот раз и `@layer`, а движок, который `@layer` не знает,
 * выбрасывает содержимое блока целиком и остаётся голый HTML.
 *
 * Здесь Vite + plugin-legacy: на выходе ES5 и полифилы. Это ровно то, что
 * делает Deeplex — у них в main-чанке ноль стрелочных функций, ноль `?.`,
 * ноль `class`, а рядом лежит отдельный polyfill.js. Проверено скачиванием.
 *
 * Целевые движки: Chrome 47 покрывает Tizen 3+ (Samsung 2017+) и webOS 3+
 * (LG 2016+). Тот самый Samsung Егора на Tizen 5.0 — это Chromium 63.
 */
export default defineConfig({
  // Приложение лежит в подпапке сайта, поэтому все ссылки на файлы должны
  // быть относительно неё. Без этого index.html просит /assets/... от корня и
  // получает 404 — проверено прогоном в браузере.
  // Для сайта — подпапка /tvweb/, для ПАКЕТОВ (.wgt/.ipk) — относительный
  // путь: внутри пакета файлы лежат рядом, и абсолютный адрес заставил бы
  // телевизор идти за ними на сайт. Собирается через TV_BASE=./
  base: process.env.TV_BASE || "/tvweb/",
  plugins: [
    react(),
    legacy({
      // Chrome 38, а не 47: с 45-й версии движок уже понимает стрелочные
      // функции и классы, и Babel их бы ОСТАВИЛ. Нам нужен полный ES5 — ровно
      // как у Deeplex, у которых в главном чанке ноль стрелок и ноль классов.
      // Так покрываются и Tizen 2.x, и webOS 3.x, то есть телевизоры с 2016.
      targets: ["chrome >= 38", "safari >= 9"],
      // Полифилы для того, чего на старых движках нет: промисы, fetch,
      // Object.assign, современные методы массивов.
      additionalLegacyPolyfills: ["regenerator-runtime/runtime"],
      renderLegacyChunks: true,
      // Обе сборки остаются: без современной Vite перестаёт выпускать CSS.
      // От их одновременного запуска защищает замок в main.tsx.
      modernPolyfills: false,
    }),
  ],
  resolve: {
    // Тот же алиас, что в Next, — чтобы переносить компоненты без правки путей.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  build: {
    outDir: "dist",
    // Только ES5 в основном бандле: на телевизоре не должно остаться ни одной
    // современной конструкции, иначе он падает на разборе, а не на выполнении.
    target: "es2015",
    cssTarget: "chrome47",
    minify: "terser",
    // Никаких модулей: старые телевизоры не понимают type="module".
    modulePreload: false,
    rollupOptions: {
      output: { manualChunks: undefined },
    },
  },
});
