import "server-only";
import { grantSubscription, isPaymentApplied, isPaymentLogged, logPayment } from "./subscription-server";
import { notifyAdmins } from "./notify-server";
import { getPlan } from "./plans";

// Единая точка применения успешного платежа: выдаёт подписку + шлёт уведомление
// админам. Зовётся из webhook/confirm/reconcile — идемпотентно (по paymentId).
//  • успех → «💰 Новая оплата» (тариф, сумма, почта, срок).
//  • succeeded, но аккаунта с такой почтой нет → «⚠️ Оплата без аккаунта»
//    (разбираемся вручную — это и есть «если что-то с оплатой, уведомление»).
// Мьютекс: сериализуем ВСЕ applyPayment в процессе (kino-web = 1 инстанс). Иначе
// гонка confirm↔reconcile: оба читают «не применён» до записи → двойное
// начисление. С мьютексом второй вызов видит запись первого в логе и выходит.
let lock: Promise<unknown> = Promise.resolve();
export function applyPayment(p: any): Promise<{ granted: boolean; email: string; reason?: string }> {
  const result = lock.then(() => doApply(p));
  lock = result.then(() => {}, () => {}); // цепочка не рвётся на ошибке
  return result;
}

async function doApply(p: any): Promise<{ granted: boolean; email: string; reason?: string }> {
  const email = String(p?.metadata?.email || "").trim().toLowerCase();
  const months = parseInt(String(p?.metadata?.months || "0"), 10);
  const planId = String(p?.metadata?.planId || "");
  const id = String(p?.id || "");
  const amount = p?.amount?.value || "?";
  if (!email || !months || !id) return { granted: false, email, reason: "bad_metadata" };
  // Идемпотентность: и по записи в аккаунте, и по вечному логу (лог ловит даже
  // платежи без аккаунта, иначе reconcile слал бы повторы каждую минуту).
  if (isPaymentApplied(email, id) || isPaymentLogged(id)) return { granted: false, email, reason: "already" };

  const res = grantSubscription(email, months, planId, id);
  const plan = getPlan(planId);
  // Пишем в вечный лог ВСЕГДА (и успех, и «без аккаунта») — ничего не теряем.
  logPayment({ id, email, amount: String(amount), planId, months, at: Date.now(), result: res ? "granted" : "no_user" });
  if (res) {
    const until = res.until ? new Date(res.until).toLocaleDateString("ru-RU") : "?";
    await notifyAdmins(
      `💰 <b>Новая оплата Про</b>\nТариф: ${plan?.label || planId}\nСумма: <b>${amount} ₽</b>\nПочта: ${email}\nАктивна до: ${until}`
    );
    return { granted: true, email };
  }
  // Платёж прошёл, но аккаунта с такой почтой нет — нужно выдать вручную.
  await notifyAdmins(
    `⚠️ <b>Оплата без аккаунта!</b>\nПочта: ${email}\nСумма: ${amount} ₽\nТариф: ${plan?.label || planId}\nПлатёж: <code>${id}</code>\nНайдите юзера и выдайте Про вручную.`
  );
  return { granted: false, email, reason: "no_user" };
}
