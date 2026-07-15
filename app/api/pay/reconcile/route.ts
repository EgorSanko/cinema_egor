import { NextRequest, NextResponse } from "next/server";
import { listSucceeded } from "@/lib/yookassa-server";
import { applyPayment } from "@/lib/apply-payment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Авто-сверка платежей (страховка): подтягивает успешные платежи YooKassa и
// выдаёт Про тем, у кого ещё не применено. Работает даже если и вебхук, и
// return-confirm не сработали. Дёргается кроном каждые ~2 мин. Источник истины —
// API YooKassa (creds на сервере), поэтому подделать нельзя. Ключ — просто чтобы
// не дёргали извне (доступ по ?key=RECONCILE_KEY или заголовку).
export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key") || req.headers.get("x-reconcile-key");
  if (!process.env.RECONCILE_KEY || key !== process.env.RECONCILE_KEY) {
    // Если ключ не задан в окружении — читаем из yookassa.json (там же creds).
    const ok = await keyOkFromFile(key);
    if (!ok) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const items = await listSucceeded(50);
  const granted: string[] = [];
  for (const p of items) {
    if (p.status !== "succeeded" || p.paid !== true) continue;
    const r = await applyPayment(p); // выдаёт + уведомляет (идемпотентно по paymentId)
    if (r.granted) granted.push(`${r.email}:${p.id}`);
  }
  return NextResponse.json({ ok: true, checked: items.length, granted });
}

async function keyOkFromFile(key: string | null): Promise<boolean> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const f = path.join(process.cwd(), "yookassa.json");
    const c = JSON.parse(fs.readFileSync(f, "utf-8"));
    return !!c.reconcileKey && key === c.reconcileKey;
  } catch {
    return false;
  }
}
