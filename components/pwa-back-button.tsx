"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";

/**
 * Floating back button for standalone PWA / iOS "Add to Home Screen" mode.
 *
 * Safari/Chrome give you a browser back button. Standalone PWA mode strips
 * the entire chrome — iOS users tap the home screen icon, land in a chromeless
 * window, drill into a movie, and get stuck because there is no back affordance
 * and iOS swipe-back gestures are not piped through to the JS history stack.
 *
 * We render the button only when:
 *   1. The app is running in standalone display mode (PWA installed) OR iOS
 *      navigator.standalone === true, AND
 *   2. We're not on the root path, AND
 *   3. The browser history stack has somewhere to go back to.
 */
export function PWABackButton() {
  const router = useRouter();
  const pathname = usePathname();
  const [isStandalone, setIsStandalone] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      // iOS Safari sets this when launched from Home Screen
      (window.navigator as any).standalone === true;
    setIsStandalone(standalone);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    // history.length is unreliable across reloads but it's the best signal
    // we have. >1 means we navigated to this page rather than landing on it
    // cold. After a hard reload it resets, so we also accept "any non-root
    // route" as fallback — worst case the button is a no-op once.
    setCanGoBack(window.history.length > 1);
  }, [pathname]);

  if (!isStandalone) return null;
  if (pathname === "/") return null;

  const handleBack = () => {
    if (canGoBack) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <button
      onClick={handleBack}
      aria-label="Назад"
      className="fixed z-50 left-3 top-[max(env(safe-area-inset-top,0px),12px)] flex items-center justify-center w-10 h-10 rounded-full bg-black/70 backdrop-blur-md ring-1 ring-white/15 text-foreground active:scale-95 transition-transform shadow-lg"
      style={{ boxShadow: "0 4px 14px -2px rgba(0,0,0,0.4)" }}
    >
      <ChevronLeft size={22} />
    </button>
  );
}
