import { NextRequest, NextResponse } from "next/server";
import { resolvePending, checkTributeSecret } from "@/lib/tribute-bridge";
import { linkTelegram } from "@/lib/subscription-server";

export const dynamic = "force-dynamic";

// Бот зовёт при /start <id>: меняем короткий id на почту и привязываем TG ID
// к аккаунту (сохраняется в базу — users.json). Секрет обязателен.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any));
  if (!checkTributeSecret(b.secret)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const id = String(b.id || "");
  const telegramId = Number(b.telegramId || 0);
  if (!telegramId) return NextResponse.json({ ok: false, error: "no_tg" });
  const email = resolvePending(id);
  if (!email) return NextResponse.json({ ok: false, error: "bad_or_expired_id" });
  const linked = linkTelegram(email, telegramId);
  return NextResponse.json({ ok: !!linked, email: linked });
}
