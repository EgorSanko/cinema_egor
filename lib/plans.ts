// Тарифы подписки «Про» — единый источник правды для страницы /pro И сервера
// (при создании платежа сервер берёт цену ОТСЮДА, не доверяя клиенту).
export type PlanId = "1m" | "3m" | "6m" | "12m";

export type Plan = {
  id: PlanId;
  months: number;
  label: string;
  price: number; // ₽
  badge?: string;
  best?: boolean;
};

// ТОЛЬКО 1 месяц. Длинные сроки НЕ продаём: если проект заблокируют, вернуть
// деньги за оплаченные вперёд месяцы будет нельзя.
export const PLANS: Plan[] = [
  { id: "1m", months: 1, label: "1 месяц", price: 100 },
];

export function getPlan(id: string): Plan | undefined {
  return PLANS.find((p) => p.id === id);
}
