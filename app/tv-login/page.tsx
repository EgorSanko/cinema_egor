import { TvLogin } from "@/components/tv/tv-login";

// TV WebView login screen ("10-foot UI"). Standalone, D-pad navigable.
// Gate for /tv-home and /tv-watch — an unauthenticated user is redirected here.

export const metadata = {
  title: "SAPKEFLY KINO — Вход",
};

export default function TvLoginPage() {
  return <TvLogin />;
}
