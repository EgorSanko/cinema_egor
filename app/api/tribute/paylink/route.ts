import { NextRequest, NextResponse } from "next/server";
import { hasVerifiedAccount } from "@/lib/subscription-server";
import { createPendingLink, TRIBUTE_BOT, TRIBUTE_WEB } from "@/lib/tribute-bridge";

export const dynamic = "force-dynamic";

// Кнопка «Купить PRO» зовёт это с почтой залогиненного юзера. Возвращаем
// deep-link на бота (несёт короткий id → почта) + веб-ссылку Tribute.
export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Войдите в аккаунт" }, { status: 400 });
  }
  if (!hasVerifiedAccount(email)) {
    return NextResponse.json({ error: "Подтвердите аккаунт (нужна регистрация)" }, { status: 400 });
  }
  const id = createPendingLink(email);
  return NextResponse.json({
    ok: true,
    botUrl: `https://t.me/${TRIBUTE_BOT}?start=${id}`,
    web: TRIBUTE_WEB,
  });
}
