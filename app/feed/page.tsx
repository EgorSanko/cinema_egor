import { TrailerFeed } from "@/components/feed/trailer-feed";

export const metadata = {
  title: "TikTak — лента трейлеров — sapkeflykino",
  description: "Вертикальная лента трейлеров в стиле TikTok: листайте и находите, что посмотреть.",
};

// Full-screen immersive feed — no top navbar so the trailer fills the screen
// (the global bottom MobileNav still provides navigation on phones).
export default function FeedPage() {
  return <TrailerFeed />;
}
