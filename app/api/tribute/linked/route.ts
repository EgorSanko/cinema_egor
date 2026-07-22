import { NextRequest, NextResponse } from "next/server";
import { checkTributeSecret } from "@/lib/tribute-bridge";
import { listLinked } from "@/lib/subscription-server";

export const dynamic = "force-dynamic";

// Бот берёт всех привязанных TG для почасовой сверки членства в PRO-канале.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any));
  if (!checkTributeSecret(b.secret)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, linked: listLinked() });
}
