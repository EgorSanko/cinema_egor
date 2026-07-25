"use client";

import { useEffect, useState } from "react";

// Видео-фон кинотеатра — мрачный атмосферный луп ЗА всем контентом, сильно
// затемнён (движение угадывается, детали тонут, постеры/текст читаются). Работает
// как слой поверх статичного html-фона (site-bg.webp остаётся фолбэком).
//   • ТОЛЬКО десктоп + без prefers-reduced-motion — на мобиле видео-фон сажает
//     батарею/трафик, там показывается статичная картинка (html bg).
//   • muted+loop+playsInline+autoPlay — иначе браузер не даст автоплей.
export function VideoBg() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const okMotion = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const wide = window.matchMedia("(min-width: 1024px)").matches;
      const notMobile = !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
      if (okMotion && wide && notMobile) setShow(true);
    } catch {}
  }, []);

  if (!show) return null;
  return (
    <div aria-hidden className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
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
