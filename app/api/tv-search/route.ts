import { NextRequest, NextResponse } from "next/server";
import { searchTvUnifiedAction } from "@/app/actions";

/**
 * Поиск для самостоятельной ТВ-обёртки (tvweb).
 *
 * На сайте экран поиска зовёт серверное действие напрямую. Отдельное
 * приложение так не умеет — оно статическое и живёт в браузере телевизора,
 * поэтому та же логика выставлена обычным адресом. Никакой новой логики
 * здесь нет: вызывается ровно то же действие, что и на сайте.
 */
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([], { headers: { "Access-Control-Allow-Origin": "*" } });
  try {
    const cards = await searchTvUnifiedAction(q);
    return NextResponse.json(cards, {
      headers: {
        "Cache-Control": "no-store",
        // Приложение может открываться и с другого адреса (пакет на
        // телевизоре, плагин MSX) — без этого заголовка запрос молча
        // заблокируется, а поиск будет «просто не работать».
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return NextResponse.json([], { headers: { "Access-Control-Allow-Origin": "*" } });
  }
}
