// app/watch/[code]/page.tsx
import WatchClient from "./watch-client";

export default async function WatchRoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <WatchClient code={code} />;
}
