"use client";

import * as React from "react";

/**
 * Brand video hero — replaces the featured-movies carousel.
 * Silent, autoplaying, looping. New releases live in the "Новинки" row below.
 */
export function HeroVideo() {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.muted = true;
    const tryPlay = () => v.play().catch(() => {});
    tryPlay();
    // some browsers need a nudge after metadata is ready
    v.addEventListener("canplay", tryPlay, { once: true });
    return () => v.removeEventListener("canplay", tryPlay);
  }, []);

  return (
    <div className="relative w-full aspect-video overflow-hidden bg-background md:max-w-[1280px] md:mx-auto md:mt-4 md:rounded-2xl md:ring-1 md:ring-white/[0.06]">
      <video
        ref={ref}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        preload="auto"
        poster="/hero-poster.jpg"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
