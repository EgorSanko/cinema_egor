import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// 17.09.2026 — ПРО У ВСЕХ, ПОКУПКА УБРАНА (решение Егора).
//
// Отвечаем «активна» любому, в том числе без email. Проверку делаем здесь, на
// сервере, а не только в хуках сайта: этот же адрес спрашивают ТВ-обёртка
// /tvweb, старая /tvapp и уже установленные APK — их не пересобрать, а без
// этого у них снова включилась бы наша реклама перед фильмом.
//
// Старый расчёт подписки (lib/subscription-server) не удалён — если платный
// тариф когда-нибудь вернут, достаточно вернуть сюда getSubscription(email).
export async function GET() {
  return NextResponse.json(
    { active: true, until: null, plan: "free" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
