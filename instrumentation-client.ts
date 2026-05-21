// Sentry — browser-side instrumentation. Initializes only when
// NEXT_PUBLIC_SENTRY_DSN is set, so it's safe to ship without a DSN.
import * as Sentry from "@sentry/nextjs";

const DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (DSN) {
  Sentry.init({
    dsn: DSN,
    tracesSampleRate: 0.05,
    // Replays disabled — GlitchTip doesn't fully support them and they
    // bloat the payload for nothing.
    replaysOnErrorSampleRate: 0,
    replaysSessionSampleRate: 0,
    initialScope: {
      tags: { app: "web", platform: "browser" },
    },
    environment: process.env.NODE_ENV,
    ignoreErrors: [
      "ChunkLoadError",
      "Loading chunk",
      "Loading CSS chunk",
      "Failed to fetch dynamically imported module",
      "ResizeObserver loop limit exceeded",
      "Non-Error promise rejection captured",
      /Hydration failed/,
      /Minified React error #418/,
      /Minified React error #423/,
      // Browser autoplay rejection on muted/non-interacted video — noisy.
      "The play() request was interrupted",
      "NotAllowedError",
    ],
  });
}
