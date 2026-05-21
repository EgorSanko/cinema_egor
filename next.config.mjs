import { withSentryConfig } from "@sentry/nextjs";

/** @type {import('next').NextConfig} */
const nextConfig = {
	output: 'standalone',
	// Prevent cross-origin warnings/errors when accessing dev server from a phone on LAN.
	// Add your machine's LAN origin here if it changes.
	allowedDevOrigins: [
		"http://localhost:3000",
		"http://127.0.0.1:3000",
		"http://192.168.0.109:3000",
	],
	typescript: {
		ignoreBuildErrors: true,
	},
	images: {
		unoptimized: true,
		remotePatterns: [
			{
				protocol: "https",
				hostname: "image.tmdb.org",
			},
		],
	},
};

// Sentry/GlitchTip wrapper — pulls sentry.client.config.ts into the client
// bundle and wires up the SDK. Source-map upload disabled (GlitchTip
// doesn't need it and it would require auth token).
export default withSentryConfig(nextConfig, {
	silent: true,
	disableLogger: true,
	sourcemaps: { disable: true },
	tunnelRoute: undefined,
	hideSourceMaps: true,
});
