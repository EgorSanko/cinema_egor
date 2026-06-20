import { Navbar } from "@/components/navbar";
import { TrailerFeed } from "@/components/feed/trailer-feed";

export const metadata = {
  title: "Лента трейлеров — sapkeflykino",
  description: "Вертикальная лента трейлеров в стиле TikTok: листайте и находите, что посмотреть.",
};

export default function FeedPage() {
  return (
    <>
      <Navbar />
      <TrailerFeed />
    </>
  );
}
