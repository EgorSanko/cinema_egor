import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/token-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Пропуск на время техработ — для nginx auth_request.
 *
 * Всем посетителям nginx показывает заглушку, а своих пускает по АККАУНТУ, а не
 * по адресу: адрес у Егора дома меняется, а на компьютере он за VPN. Аккаунт
 * узнаём по подписанной куке kino_sub — её ставит вход на сайте и в ТВ-обёртке,
 * подделать её без секрета нельзя (см. lib/token-server).
 *
 * 200 — пускаем, 401 — nginx отдаёт страницу техработ.
 *
 * Восстановлен 16.09 после отката кода к 8 сентября (сам файл был удалён
 * откатом) — механизм прежний, см. память reference_sapkeflykino_maintenance_mode.
 */

const СВОИ = (process.env.TEHRAB_EMAILS
  || "egorsanko@bk.ru,egor3sanko22@gmail.com,egor3sanko22@mail.ru")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function решить(req: NextRequest): number {
  // nginx уже решил пустить: запрос с наших серверов или браузер с кукой
  // kino_dev. Заголовок ставит сам nginx и перезаписывает присланный снаружи.
  if (req.headers.get("x-kino-open") === "1") return 200;

  // Вход должен работать и из заглушки — иначе с нового устройства не войти.
  const адрес = req.headers.get("x-original-uri") || "";
  if (адрес === "/api/auth" || адрес.startsWith("/api/auth?")) return 200;

  const email = verifyToken(req.cookies.get("kino_sub")?.value || "");
  return email && СВОИ.includes(email) ? 200 : 401;
}

export async function GET(req: NextRequest) {
  return new NextResponse(null, { status: решить(req) });
}
// auth_request повторяет метод исходного запроса.
export async function HEAD(req: NextRequest) {
  return new NextResponse(null, { status: решить(req) });
}
export async function POST(req: NextRequest) {
  return new NextResponse(null, { status: решить(req) });
}
