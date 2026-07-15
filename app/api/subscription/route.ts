import { NextRequest, NextResponse } from "next/server";
import { getSubscription } from "@/lib/subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Статус подписки по email (для Pro-бейджа и гейта переключения источников).
// Пока без токена (серверный гейт резолва — следующая фаза); отдаём только
// active/until/plan — не чувствительные данные.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@")) return NextResponse.json({ active: false, until: null, plan: null });
  return NextResponse.json(getSubscription(email), { headers: { "Cache-Control": "no-store" } });
}
