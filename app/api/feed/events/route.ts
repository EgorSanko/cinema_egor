import { NextResponse } from "next/server";
import { recordPositive } from "@/lib/feed/cooc";

// Phase 1: taste vector lives client-side; ranking is stateless per request.
// Phase 2: we also fold POSITIVE engagements into a GLOBAL item-item
// co-occurrence map ("люди, которым зашёл X, любят и Y"). Only positives are
// stored, the map is bounded/pruned (see lib/feed/cooc.ts), so this can never
// fill the disk. Body = the SignalEvent + `recentPositives` (the user's other
// recently-liked movieIds, sent by the client).
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const positive =
      b?.tapWatch || b?.playedFull || b?.liked || b?.saved ||
      (b?.completed && (b?.pctWatched || 0) > 0.7);
    if (positive && b?.movieId && Array.isArray(b?.recentPositives)) {
      recordPositive(
        Number(b.movieId),
        b.recentPositives.map(Number).filter(Boolean)
      );
    }
  } catch { /* never throw into a beacon */ }
  return new NextResponse(null, { status: 204 });
}
