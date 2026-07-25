"use client";

import { useEffect, useState } from "react";

// Видео-фон кинотеатра — мрачный атмосферный луп ЗА всем контентом, сильно
// затемнён (движение угадывается, детали тонут, постеры/текст читаются). Работает
// как слой поверх статичного webp-фона (body::before остаётся фолбэком).
//   • Видео ВЕЗДЕ — и десктоп, и мобила (по просьбе: фон одинаковый на всех).
//     Исключение — prefers-reduced-motion: там остаётся статичная картинка.
//   • muted+loop+playsInline+autoPlay — иначе браузер (особенно iOS) не даст автоплей;
//     если автоплей всё же заблокирован (энергосбережение) — снизу виден webp.
export function VideoBg() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const okMotion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (okMotion) setShow(true);
    } catch {}
  }, []);

  if (!show) return null;
  return (
    <div aria-hidden className="fixed inset-0 -z-[1] overflow-hidden pointer-events-none">
      <video
        className="absolute inset-0 h-full w-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        src="/site-bg.mp4?v=1"
      />
      {/* Затемнение — видео уходит в мрачную текстуру, контент поверх читается. */}
      <div className="absolute inset-0" style={{ background: "rgba(10,10,11,0.72)" }} />
    </div>
  );
}
