import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/token-server";
import { getSubscription } from "@/lib/subscription-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Гейт подписки для nginx auth_request. Перед отдачей Pro-стрима (/hdrezka/, /kp/)
// nginx дёргает этот эндпоинт с cookie юзера. 200 = пускаем (активная подписка),
// 403 = нет подписки, 401 = нет/битый токен. nginx auth_request: 2xx→allow,
// 401/403→блок. Свободный источник (zenithjs) СЮДА не заходит — он открыт всем.
function decide(req: NextRequest): number {
  // ПОЛНЫЙ гейт: нативное Android-приложение выведено из эксплуатации (все ходят
  // через сайт), поэтому UA-исключения больше нет — гейтим ВСЕХ (закрыт и обход
  // через подделку User-Agent). Свободный источник (zenithjs) сюда не заходит.
  const token = req.cookies.get("kino_sub")?.value || "";
  const email = verifyToken(token);
  if (!email) return 401;
  return getSubscription(email).active ? 200 : 403;
}

export async function GET(req: NextRequest) {
  return new NextResponse(null, { status: decide(req) });
}
// nginx auth_request шлёт исходный метод; поддержим и HEAD/POST на всякий.
export async function HEAD(req: NextRequest) {
  return new NextResponse(null, { status: decide(req) });
}
export async function POST(req: NextRequest) {
  return new NextResponse(null, { status: decide(req) });
}
