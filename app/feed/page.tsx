import { TrailerFeed } from "@/components/feed/trailer-feed";

export const metadata = {
  title: "Лента трейлеров — sapkeflykino",
  description: "Вертикальная лента трейлеров в стиле TikTok: листайте и находите, что посмотреть.",
};

// Immersive: NO top navbar — the feed is the only scroll surface, so swipes
// move the slides (one-at-a-time) instead of scrolling the whole page.
export default function FeedPage() {
  return <TrailerFeed />;
}
