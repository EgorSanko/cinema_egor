import { Navbar } from "@/components/navbar";
import { HdDetail, type HdDetails } from "@/components/hd-detail";
import { isBlockedHd } from "@/lib/blocked-content";
import { notFound } from "next/navigation";
import type { Metadata } from "next";

const BACKEND = "https://kino.lead-seek.ru/hdrezka/api";

interface PageProps {
  params: Promise<{ token: string }>;
}

function decodeToken(token: string): string {
  try {
    return Buffer.from(decodeURIComponent(token), "base64url").toString("utf-8");
  } catch {
    return "";
  }
}

async function getDetails(url: string): Promise<HdDetails | null> {
  try {
    const r = await fetch(`${BACKEND}/details?url=${encodeURIComponent(url)}`, {
      next: { revalidate: 3600 },
    });
    const d = await r.json();
    if (!d || d.error || !d.title) return null;
    return d as HdDetails;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { token } = await params;
  const url = decodeToken(token);
  const d = url ? await getDetails(url) : null;
  return {
    title: d ? `${d.title}${d.year ? ` (${d.year})` : ""} — смотреть онлайн` : "sapkeflykino",
    description: d?.description?.slice(0, 160),
  };
}

export default async function HdPage({ params }: PageProps) {
  const { token } = await params;
  const url = decodeToken(token);
  if (isBlockedHd(url)) notFound(); // legal takedown — un-viewable
  const details = url ? await getDetails(url) : null;
  if (details && isBlockedHd(url, details.title)) notFound();

  if (!details) {
    return (
      <>
        <Navbar />
        <main className="bg-background min-h-screen flex items-center justify-center px-4">
          <div className="text-center">
            <p className="text-xl text-foreground/80 mb-2">Не удалось загрузить тайтл</p>
            <p className="text-sm text-muted-foreground">Возможно, страница на HDRezka изменилась.</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <HdDetail details={{ ...details, url }} />
    </>
  );
}
