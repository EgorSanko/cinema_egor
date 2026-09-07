import { NextRequest, NextResponse } from "next/server";
import { создатьПлатёж, rollypayГотов } from "@/lib/rollypay";
import { hasVerifiedAccount } from "@/lib/subscription-server";
import { PLANS } from "@/lib/plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Готова ли оплата картой/СБП — чтобы страница знала, показывать ли кнопку. */
export async function GET() {
  return NextResponse.json({ ready: rollypayГотов() }, { headers: { "Cache-Control": "no-store" } });
}

/**
 * Создать платёж и вернуть ссылку на оплату.
 *
 * Платим только за существующий подтверждённый аккаунт: иначе оплата повиснет
 * в воздухе — включать подписку будет некому, а деньги уже взяты.
 *
 * Цену берём из своего справочника тарифов, а НЕ из тела запроса: иначе любой
 * желающий пришлёт «amount: 1» и купит месяц за рубль.
 */
export async function POST(req: NextRequest) {
  if (!rollypayГотов()) {
    return NextResponse.json({ ok: false, error: "Оплата ещё не настроена" }, { status: 503 });
  }

  const тело = await req.json().catch(() => ({}));
  const email = String(тело.email || "").trim().toLowerCase();
  const planId = String(тело.planId || PLANS[0]?.id || "");

  if (!email || !email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Укажите почту" }, { status: 400 });
  }
  if (!hasVerifiedAccount(email)) {
    return NextResponse.json(
      { ok: false, error: "Сначала войдите в аккаунт и подтвердите почту" },
      { status: 403 },
    );
  }

  const план = PLANS.find((p) => p.id === planId) || PLANS[0];
  if (!план) {
    return NextResponse.json({ ok: false, error: "Тариф не найден" }, { status: 400 });
  }

  const итог = await создатьПлатёж({
    email,
    amount: `${план.price}.00`,
    months: план.months,
    описание: `Поддержка sapkeflykino — Про на ${план.months} мес.`,
  });

  if (!итог.ok) return NextResponse.json({ ok: false, error: итог.error }, { status: 502 });
  return NextResponse.json({ ok: true, payUrl: итог.payUrl, orderId: итог.orderId });
}
