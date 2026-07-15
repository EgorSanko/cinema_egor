import { NextRequest, NextResponse } from "next/server";
import { fetchPayment } from "@/lib/yookassa-server";
import { applyPayment } from "@/lib/apply-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Вебхук YooKassa: приходит payment.succeeded. НЕ доверяем телу — перечитываем
// платёж по id из API и проверяем статус=succeeded. Затем выдаём подписку по
// metadata (email, months). Идемпотентно (одно событие может прийти дважды).
// Всегда отвечаем 200, иначе YooKassa будет слать повторы.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  try {
    const id = body?.object?.id;
    if (!id) return NextResponse.json({ ok: true });

    // Достоверный источник истины — API, а не тело уведомления.
    const p = await fetchPayment(String(id));
    if (!p || p.status !== "succeeded" || p.paid !== true) return NextResponse.json({ ok: true });

    const r = await applyPayment(p); // выдаёт подписку + уведомляет админов
    return NextResponse.json({ ok: true, granted: r.granted });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
