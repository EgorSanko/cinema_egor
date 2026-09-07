import "server-only";
import crypto from "crypto";
import fs from "fs";
import path from "path";

/**
 * Приём оплаты через RollyPay (СБП, карты, крипта).
 *
 * Зачем рядом с Tribute: Tribute живёт только внутри Telegram и включает PRO
 * по факту ВСТУПЛЕНИЯ в закрытый канал — кто оплатил, но не вступил, оставался
 * без подписки. Здесь обычный подписанный вебхук: заплатил — включили.
 *
 * Ключи держим ТОЛЬКО в переменных окружения на сервере. В репозиторий они не
 * попадают: полный API-ключ вообще показывается один раз при выпуске.
 */

const БАЗА = process.env.ROLLYPAY_API_BASE || "https://api.rollypay.io/api/v1";
const КЛЮЧ = process.env.ROLLYPAY_API_KEY || "";
const КАССА = process.env.ROLLYPAY_TERMINAL_ID || "";
const СЕКРЕТ = process.env.ROLLYPAY_SIGNING_SECRET || "";

/** Настроен ли приём платежей. Без ключа кнопку оплаты не показываем. */
export function rollypayГотов(): boolean {
  return Boolean(КЛЮЧ && КАССА && СЕКРЕТ);
}

// ── Соответствие «заказ → почта» ─────────────────────────────────────────
//
// Почту кладём и в metadata платежа, но полагаться на неё нельзя: вернёт ли
// провайдер метаданные в вебхуке — его дело. Свой файл надёжнее, он же
// источник правды при разборе спорных платежей.
const ФАЙЛ_ЗАКАЗОВ = path.join(process.cwd(), "rollypay-orders.json");

type Заказ = { email: string; months: number; amount: string; at: number; test?: boolean };

function читатьЗаказы(): Record<string, Заказ> {
  try {
    if (fs.existsSync(ФАЙЛ_ЗАКАЗОВ)) return JSON.parse(fs.readFileSync(ФАЙЛ_ЗАКАЗОВ, "utf-8"));
  } catch {}
  return {};
}

function писатьЗаказы(з: Record<string, Заказ>) {
  // Атомарно: параллельный вебхук не должен прочитать полу-записанный файл.
  const врем = ФАЙЛ_ЗАКАЗОВ + ".tmp";
  fs.writeFileSync(врем, JSON.stringify(з, null, 2), "utf-8");
  fs.renameSync(врем, ФАЙЛ_ЗАКАЗОВ);
}

export function запомнитьЗаказ(orderId: string, з: Заказ) {
  const все = читатьЗаказы();
  все[orderId] = з;
  // Держим последние 500 — файл не должен расти без предела.
  const ключи = Object.keys(все).sort((a, b) => (все[b].at || 0) - (все[a].at || 0)).slice(0, 500);
  писатьЗаказы(Object.fromEntries(ключи.map((k) => [k, все[k]])));
}

export function найтиЗаказ(orderId: string): Заказ | null {
  return читатьЗаказы()[orderId] || null;
}

// ── Создание платежа ─────────────────────────────────────────────────────
export type СозданныйПлатёж = { ok: true; payUrl: string; paymentId: string; orderId: string } | { ok: false; error: string };

export async function создатьПлатёж(опции: {
  email: string;
  amount: string;
  months: number;
  описание: string;
  тест?: boolean;
}): Promise<СозданныйПлатёж> {
  if (!rollypayГотов()) return { ok: false, error: "Оплата ещё не настроена" };

  // order_id — наш естественный ключ идемпотентности: один заказ = один платёж.
  const orderId = `pro-${Date.now().toString(36)}-${crypto.randomBytes(4).toString("hex")}`;

  const тело: Record<string, unknown> = {
    terminal_id: КАССА,
    amount: опции.amount,
    payment_currency: "RUB",
    order_id: orderId,
    description: опции.описание,
    success_redirect_url: "https://sapkeflykino.ru/pro?paid=1",
    fail_redirect_url: "https://sapkeflykino.ru/pro?fail=1",
    metadata: { email: опции.email, months: опции.months },
  };
  if (опции.тест) тело.test = true;

  try {
    const о = await fetch(`${БАЗА}/payments`, {
      method: "POST",
      headers: {
        "X-API-Key": КЛЮЧ,
        "X-Nonce": crypto.randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(тело),
      cache: "no-store",
    });
    const д = await о.json().catch(() => ({}));
    if (!о.ok) {
      return { ok: false, error: `Платёжный сервис ответил ${о.status}: ${JSON.stringify(д).slice(0, 160)}` };
    }
    const payUrl = д.pay_url || д.payUrl;
    if (!payUrl) return { ok: false, error: "Платёжный сервис не вернул ссылку на оплату" };

    запомнитьЗаказ(orderId, {
      email: опции.email.trim().toLowerCase(),
      months: опции.months,
      amount: опции.amount,
      at: Date.now(),
      test: опции.тест,
    });
    return { ok: true, payUrl, paymentId: д.id || д.payment_id || "", orderId };
  } catch (e) {
    return { ok: false, error: `Не удалось связаться с платёжным сервисом: ${String(e).slice(0, 120)}` };
  }
}

// ── Проверка подписи вебхука ─────────────────────────────────────────────
/**
 * Подпись — HMAC-SHA256 от «timestamp.тело» ключом кассы.
 *
 * Проверять ОБЯЗАТЕЛЬНО: без неё кто угодно, зная адрес вебхука, пришлёт нам
 * «оплату» и получит подписку бесплатно. Тело нужно СЫРОЕ — после JSON.parse
 * и повторной сборки байты уже другие, подпись не сойдётся.
 */
export function подписьВерна(сыроеТело: string, timestamp: string, подпись: string): boolean {
  if (!СЕКРЕТ || !подпись || !timestamp) return false;

  // Отбиваем повтор старого вебхука: подписанный запрос, записанный когда-то,
  // иначе можно проигрывать заново сколько угодно.
  const возраст = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(возраст) || возраст > 600) return false;

  const ожидаемая = crypto.createHmac("sha256", СЕКРЕТ).update(`${timestamp}.${сыроеТело}`).digest("hex");
  const а = Buffer.from(ожидаемая, "utf-8");
  const б = Buffer.from(подпись.trim(), "utf-8");
  if (а.length !== б.length) return false;         // timingSafeEqual падает на разной длине
  return crypto.timingSafeEqual(а, б);
}
