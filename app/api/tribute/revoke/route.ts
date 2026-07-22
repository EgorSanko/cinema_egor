import { NextRequest, NextResponse } from "next/server";
import { checkTributeSecret } from "@/lib/tribute-bridge";
import { revokeTribute } from "@/lib/subscription-server";
import { notifyAdmins } from "@/lib/notify-server";

export const dynamic = "force-dynamic";

// Бот зовёт когда TG-юзер вышел/исключён из PRO-канала (Tribute снял доступ по
// окончании оплаты). Гасим ТОЛЬКО tribute-подписку (оплаченные иначе — не трогаем).
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any));
  if (!checkTributeSecret(b.secret)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const telegramId = Number(b.telegramId || 0);
  if (!telegramId) return NextResponse.json({ ok: false, error: "no_tg" });
  const email = revokeTribute(telegramId);
  if (email) {
    notifyAdmins(`🚫 <b>Tribute PRO снят</b> (вышел из PRO-канала)\nПочта: ${email}\nTG: <code>${telegramId}</code>`).catch(() => {});
  }
  return NextResponse.json({ ok: true, email });
}
