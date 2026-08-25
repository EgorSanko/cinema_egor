
import { useEffect, useRef, useState } from "react";

/**
 * Full-screen animated-logo splash. The video is green-on-BLACK and fills the
 * whole screen, so there's no visible box (the black bg = the screen). Plays
 * once per session, then fades and calls onDone. Skippable with any key / click.
 */
export function LogoSplash({ onDone }: { onDone: () => void }) {
  const [fading, setFading] = useState(false);
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    setFading(true);
    setTimeout(onDone, 450); // after the fade-out
  };

  useEffect(() => {
    const cap = setTimeout(finish, 6000); // safety: never get stuck on the splash
    const skip = () => finish();
    window.addEventListener("keydown", skip);
    return () => {
      clearTimeout(cap);
      window.removeEventListener("keydown", skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black flex items-center justify-center transition-opacity duration-[450ms]"
      style={{ opacity: fading ? 0 : 1 }}
      onClick={finish}
    >
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video
        autoPlay
        muted
        playsInline
        onEnded={finish}
        poster="/tv-splash-poster.jpg"
        className="w-full h-full object-contain"
      >
        <source src="/tv-splash.webm" type="video/webm" />
        <source src="/tv-splash.mp4" type="video/mp4" />
      </video>
    </div>
  );
}
