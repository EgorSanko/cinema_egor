import { NextRequest, NextResponse } from "next/server";
import { checkTributeSecret } from "@/lib/tribute-bridge";
import { extendTribute, getSubscription, findEmailByTelegram, logPayment } from "@/lib/subscription-server";
import { notifyAdmins } from "@/lib/notify-server";

export const dynamic = "force-dynamic";

// Бот зовёт когда TG-юзер состоит в PRO-канале (вступил или почасовая сверка).
// Членство = PRO: продлеваем окно на 35 дней (idempotent). Уведомляем/логируем
// ТОЛЬКО при первом включении (activated), чтобы сверка не спамила.
export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({} as any));
  if (!checkTributeSecret(b.secret)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  const telegramId = Number(b.telegramId || 0);
  if (!telegramId) return NextResponse.json({ ok: false, error: "no_tg" });

  const email = findEmailByTelegram(telegramId);
  if (!email) return NextResponse.json({ ok: false, error: "not_linked", telegramId });

  const res = extendTribute(telegramId, 35);
  if (!res) return NextResponse.json({ ok: false, error: "not_linked", telegramId });

  if (res.activated) {
    const now = Date.now();
    try {
      logPayment({ id: `tribute:${telegramId}:${now}`, email: res.email, amount: "100", planId: "tribute", months: 1, at: now, result: "granted" });
    } catch {}
    const sub = getSubscription(res.email);
    const until = sub.until ? new Date(sub.until).toLocaleDateString("ru-RU") : "?";
    notifyAdmins(`💎 <b>Tribute PRO включён</b>\nПочта: ${res.email}\nTG: <code>${telegramId}</code>\nАктивна до: ${until}`).catch(() => {});
  }

  const sub = getSubscription(res.email);
  return NextResponse.json({ ok: true, email: res.email, active: sub.active, until: sub.until, activated: res.activated });
}
