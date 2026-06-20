import { NextResponse } from "next/server";

// Phase 1: implicit signals are folded into the taste vector CLIENT-side
// (localStorage), and ranking is stateless per-request — so the server needs
// no per-user store. We accept the beacon and no-op (no disk writes, so this
// can never fill the VPS disk). Phase 2 (analytics / collaborative filtering)
// will persist these to compute cross-user signals.
export const runtime = "nodejs";

export async function POST() {
  return new NextResponse(null, { status: 204 });
}
