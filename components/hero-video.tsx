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
    <div className="relative w-full h-[78vh] min-h-[560px] md:h-[86vh] md:min-h-[700px] overflow-hidden -mt-16">
      <video
        ref={ref}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        poster="/hero-poster.jpg"
      >
        <source src="/hero.mp4" type="video/mp4" />
      </video>
      {/* soft fade into the page background so it blends seamlessly */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/10 to-transparent pointer-events-none" />
    </div>
  );
}
