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
    <div className="relative w-full aspect-video max-h-[64vh] overflow-hidden bg-background">
      <video
        ref={ref}
        className="absolute inset-0 w-full h-full object-cover object-[50%_60%]"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/hero-poster.jpg"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
