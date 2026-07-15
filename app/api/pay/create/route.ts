import { NextRequest, NextResponse } from "next/server";
import { getPlan } from "@/lib/plans";
import { createPayment, isConfigured } from "@/lib/yookassa-server";
import { hasVerifiedAccount } from "@/lib/subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Создаёт платёж в YooKassa и возвращает confirmation_url для редиректа.
// Цену берём ИЗ СЕРВЕРНОГО списка тарифов по planId (клиенту не доверяем).
export async function POST(req: NextRequest) {
  if (!isConfigured()) return NextResponse.json({ error: "Оплата пока не настроена" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const planId = String(body.planId || "");
  if (!email || !email.includes("@")) return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 400 });

  // Платить можно только с подтверждённым аккаунтом (иначе оплата «повисает» без
  // привязки). Phantom/неподтверждённый → просим подтвердить почту.
  if (!hasVerifiedAccount(email)) {
    return NextResponse.json({ error: "Подтвердите почту в аккаунте (выйдите и войдите заново, введите код из письма), затем оформите Про." }, { status: 403 });
  }

  const plan = getPlan(planId);
  if (!plan) return NextResponse.json({ error: "Неизвестный тариф" }, { status: 400 });

  const res = await createPayment({
    amount: plan.price,
    description: `Подписка Про — ${plan.label} · ${email}`,
    returnUrl: "https://sapkeflykino.ru/pro?paid=1",
    metadata: { email, planId: plan.id, months: String(plan.months) },
  });

  if ("error" in res) return NextResponse.json({ error: "Не удалось создать платёж", detail: res.error }, { status: 502 });
  return NextResponse.json({ confirmationUrl: res.confirmationUrl, paymentId: res.id });
}
