import { NextResponse } from "next/server";

/**
 * Приёмник ошибок с устройств без консоли (телевизоры, приставки).
 * Ничего не хранит: сам факт запроса вместе с текстом ошибки попадает в лог
 * nginx, оттуда его и читаем. Отдаём пустой ответ, чтобы не тратить трафик.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
