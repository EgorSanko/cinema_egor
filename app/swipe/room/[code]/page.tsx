import { Navbar } from "@/components/navbar";
import { RoomClient } from "./room-client";

interface RoomPageProps {
  params: Promise<{ code: string }>;
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { code } = await params;

  return (
    <>
      <Navbar />
      <RoomClient code={code} />
    </>
  );
}
