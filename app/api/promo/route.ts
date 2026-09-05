import { NextResponse } from "next/server";
import { прочитатьАкцию } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Публичный статус акции — чтобы баннер знал повод и дату окончания.
 *
 * Отдаём и тем, кто не вошёл: для них баннер работает приглашением
 * зарегистрироваться, ведь подарок привязан к аккаунту.
 */
export async function GET() {
  const а = прочитатьАкцию();
  const сейчас = Date.now();
  const идёт = а.включена && сейчас >= а.начало && сейчас < а.конец;
  return NextResponse.json(
    {
      идёт,
      конец: идёт ? а.конец : null,
      повод: идёт ? а.повод : "",
      днейНовичку: а.днейНовичку,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
