import { NextRequest, NextResponse } from "next/server";
import { fetchPayment } from "@/lib/yookassa-server";
import { getSubscription } from "@/lib/subscription-server";
import { applyPayment } from "@/lib/apply-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Подтверждение оплаты по возврату с YooKassa (fast-path, не зависит от вебхука).
// Клиент присылает paymentId (сохранённый перед редиректом). Мы перечитываем
// платёж из API и, если succeeded, выдаём подписку по metadata.email (доверяем
// YooKassa, не клиенту — поэтому подделать чужую подписку нельзя). Идемпотентно.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const paymentId = String(body.paymentId || "").trim();
  if (!paymentId) return NextResponse.json({ ok: false, error: "no_payment_id" }, { status: 400 });

  const p = await fetchPayment(paymentId);
  if (!p) return NextResponse.json({ ok: false, error: "not_found" });
  if (p.status !== "succeeded" || p.paid !== true) {
    return NextResponse.json({ ok: false, status: p.status, pending: p.status === "pending" });
  }

  const r = await applyPayment(p); // выдаёт подписку + уведомляет админов (идемпотентно)
  const email = r.email;
  if (!email) return NextResponse.json({ ok: false, error: "bad_metadata" });
  const sub = getSubscription(email);
  return NextResponse.json({ ok: true, active: sub.active, until: sub.until, plan: sub.plan, email });
}
