import { NextRequest, NextResponse } from "next/server";
import { подписьВерна, найтиЗаказ } from "@/lib/rollypay";
import { grantSubscription, isPaymentLogged, logPayment, hasVerifiedAccount } from "@/lib/subscription-server";
import { notifyAdmins } from "@/lib/notify-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Вебхук RollyPay: пришла смена статуса платежа.
 *
 * Порядок важен и менять его нельзя:
 *   1) читаем СЫРОЕ тело (после разбора JSON байты уже другие — подпись не сойдётся);
 *   2) проверяем подпись — без неё кто угодно пришлёт нам «оплату»;
 *   3) и только потом что-то начисляем.
 *
 * Отвечаем 200 на всё, что успешно проверено, даже если начислять нечего:
 * иначе платёжный сервис будет долбить повторной доставкой по кругу.
 */
export async function POST(req: NextRequest) {
  const сырое = await req.text();
  const подпись = req.headers.get("x-signature") || "";
  const timestamp = req.headers.get("x-timestamp") || "";

  if (!подписьВерна(сырое, timestamp, подпись)) {
    // Ничего не рассказываем о причине: это защитный рубеж.
    return new NextResponse("Invalid signature", { status: 403 });
  }

  let событие: any;
  try {
    событие = JSON.parse(сырое);
  } catch {
    return new NextResponse("Bad JSON", { status: 400 });
  }

  const тип = String(событие.event_type || "");
  const статус = String(событие.status || "");
  const платёжId = String(событие.payment_id || событие.id || "");
  const orderId = String(событие.order_id || "");
  const сумма = String(событие.amount || "");
  const тестовый = Boolean(событие.test);

  // Интересует только успешная оплата. Остальные события подтверждаем и молчим.
  if (тип !== "payment.paid" && статус !== "paid") {
    return NextResponse.json({ ok: true, ignored: тип || статус });
  }

  // Тестовые платежи из песочницы не должны включать настоящую подписку.
  if (тестовый) {
    return NextResponse.json({ ok: true, test: true });
  }

  // Повтор доставки того же платежа не должен начислять второй месяц.
  if (платёжId && isPaymentLogged(платёжId)) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const заказ = найтиЗаказ(orderId);
  const email = (заказ?.email || событие?.metadata?.email || "").toString().trim().toLowerCase();
  const months = Number(заказ?.months || событие?.metadata?.months || 1) || 1;

  if (!email) {
    // Деньги пришли, а чей платёж — неизвестно. Не теряем: пишем в лог и зовём
    // людей разбираться руками.
    logPayment({ id: платёжId || orderId, email: "", amount: сумма, planId: "rollypay", months, at: Date.now(), result: "no_user" });
    await notifyAdmins(`⚠️ RollyPay: оплата ${сумма} ₽ без привязки к аккаунту. order_id: ${orderId}`);
    return NextResponse.json({ ok: true, unmatched: true });
  }

  if (!hasVerifiedAccount(email)) {
    // grantSubscription создаст «теневую» запись — подписка дождётся регистрации.
    logPayment({ id: платёжId || orderId, email, amount: сумма, planId: "rollypay", months, at: Date.now(), result: "no_user" });
    grantSubscription(email, months, "rollypay", платёжId);
    await notifyAdmins(`⚠️ RollyPay: оплата ${сумма} ₽ на почту ${email} — аккаунта ещё нет, подписка ждёт регистрации.`);
    return NextResponse.json({ ok: true, pending: true });
  }

  grantSubscription(email, months, "rollypay", платёжId);
  logPayment({ id: платёжId || orderId, email, amount: сумма, planId: "rollypay", months, at: Date.now(), result: "granted" });
  await notifyAdmins(`💎 RollyPay: Про включён для ${email} — ${сумма} ₽ на ${months} мес.`);

  return NextResponse.json({ ok: true });
}
