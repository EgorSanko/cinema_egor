import { TrailerFeed } from "@/components/feed/trailer-feed";

export const metadata = {
  title: "Лента трейлеров — sapkeflykino",
  description: "Вертикальная лента трейлеров в стиле TikTok: листайте и находите, что посмотреть.",
};

// Immersive: no top navbar so the feed is the only scroll surface (swipes move
// slides one at a time instead of scrolling the whole page).
export default function FeedPage() {
  return <TrailerFeed />;
}
