import "server-only";
import fs from "fs";
import path from "path";

// Серверная работа с подпиской. Храним прямо в users.json (как и аккаунты) —
// поле `subscription: {until}`. active вычисляем от until > now, чтобы истёкшая
// подписка автоматически «гасла» без крона.
const USERS_FILE = path.join(process.cwd(), "users.json");
// Вечный append-only лог ВСЕХ применённых платежей — чтобы ни одна оплата не
// потерялась, даже если users.json пострадает. Топ-левел файл (вне deploy-tgz).
const PAYMENTS_FILE = path.join(process.cwd(), "payments.json");

export type StoredSub = { until: number; plan?: string; lastPaymentId?: string };
type StoredUser = {
  email: string; password: string; name: string; verified?: boolean;
  subscription?: StoredSub;
  telegramId?: number; // привязка Telegram (для Tribute-моста)
};

function readUsers(): Record<string, StoredUser> {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {}
  return {};
}
function writeUsers(u: Record<string, StoredUser>) {
  // Атомарно: пишем во временный файл, затем rename — иначе параллельный
  // вебхук/логин может прочитать полу-записанный JSON.
  const tmp = USERS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(u, null, 2), "utf-8");
  fs.renameSync(tmp, USERS_FILE);
}

const norm = (e: string) => e.trim().toLowerCase();
const MONTH_MS = 30 * 24 * 3600 * 1000;

export type SubStatus = { active: boolean; until: number | null; plan: string | null };

/** Реальный подтверждённый аккаунт? (есть пароль + verified!==false). Shadow-
 *  запись (оплата до регистрации, password:"") — НЕ считается. Нужно, чтобы
 *  нельзя было платить/входить с неподтверждённого/phantom-аккаунта. */
export function hasVerifiedAccount(email: string): boolean {
  const u = readUsers()[norm(email)];
  return !!u && !!u.password && u.verified !== false;
}

export function getSubscription(email: string): SubStatus {
  const u = readUsers()[norm(email)];
  const until = u?.subscription?.until ?? 0;
  const active = until > Date.now();
  return { active, until: active ? until : null, plan: active ? u?.subscription?.plan ?? null : null };
}

/** Выдать/продлить подписку. Если аккаунта с такой почтой ещё нет — создаём
 *  «shadow»-запись (без пароля, verified:false): подписка ждёт, и когда человек
 *  зарегистрируется с этой почтой, он её унаследует (verify сохраняет поля).
 *  Так оплата до регистрации не теряется. */
export function grantSubscription(email: string, months: number, plan?: string, paymentId?: string): SubStatus | null {
  const users = readUsers();
  const key = norm(email);
  if (!users[key]) {
    // Shadow: verified:false, чтобы регистрация этой почтой прошла (не «уже
    // существует») и подхватила подписку. Логиниться пока нельзя (нет пароля).
    users[key] = { email: key, password: "", name: key.split("@")[0], verified: false } as any;
  }
  const u = users[key];
  const base = Math.max(Date.now(), u.subscription?.until ?? 0);
  const until = base + months * MONTH_MS;
  u.subscription = { until, plan, lastPaymentId: paymentId };
  writeUsers(users);
  return { active: true, until, plan: plan ?? null };
}

// ── Tribute-мост: привязка Telegram ↔ почта ──
/** Привязать Telegram ID к аккаунту (по почте). Если аккаунта ещё нет —
 *  создаём shadow-запись (как в grantSubscription), чтобы привязка не потерялась
 *  до регистрации. Возвращает почту (нормализованную) или null. */
export function linkTelegram(email: string, telegramId: number): string | null {
  if (!email || !telegramId) return null;
  const users = readUsers();
  const key = norm(email);
  if (!users[key]) {
    users[key] = { email: key, password: "", name: key.split("@")[0], verified: false } as any;
  }
  // Снимаем этот telegramId с других аккаунтов (один TG = один аккаунт).
  for (const [k, u] of Object.entries(users)) {
    if (k !== key && u.telegramId === telegramId) delete u.telegramId;
  }
  users[key].telegramId = telegramId;
  writeUsers(users);
  return key;
}

/** Найти почту аккаунта по Telegram ID (обратный поиск для вебхука бота). */
export function findEmailByTelegram(telegramId: number): string | null {
  if (!telegramId) return null;
  const users = readUsers();
  for (const [k, u] of Object.entries(users)) if (u.telegramId === telegramId) return k;
  return null;
}

/** Все привязанные Telegram (для почасовой сверки членства бот↔канал). */
export function listLinked(): { telegramId: number; email: string; active: boolean }[] {
  const users = readUsers();
  const out: { telegramId: number; email: string; active: boolean }[] = [];
  for (const [k, u] of Object.entries(users)) {
    if (u.telegramId) out.push({ telegramId: u.telegramId, email: k, active: (u.subscription?.until ?? 0) > Date.now() });
  }
  return out;
}

/** Продлить/включить Tribute-подписку до now+days. ИДЕМПОТЕНТНО: если уже
 *  активна дольше цели — не трогаем (не портим оплаченную YooKassa-подписку и не
 *  раздуваем срок при почасовой сверке). Возвращает {email, activated}, где
 *  activated=true только когда была НЕактивной и стала активной (для уведомления
 *  админам — чтобы не спамить на каждой сверке). */
export function extendTribute(telegramId: number, days: number): { email: string; activated: boolean } | null {
  const email = findEmailByTelegram(telegramId);
  if (!email) return null;
  const users = readUsers();
  const u = users[email];
  if (!u) return null;
  const now = Date.now();
  const wasActive = (u.subscription?.until ?? 0) > now;
  const target = now + days * 24 * 3600 * 1000;
  // Пишем только если осталось меньше (days-1) — иначе частая сверка (раз в 3
  // мин) дёргала бы users.json каждый цикл. Так обновление ~раз в сутки.
  const refreshBelow = now + (days - 1) * 24 * 3600 * 1000;
  if ((u.subscription?.until ?? 0) < refreshBelow) {
    u.subscription = { until: target, plan: "tribute", lastPaymentId: u.subscription?.lastPaymentId };
    writeUsers(users);
  }
  return { email, activated: !wasActive };
}

/** Снять Tribute-подписку при выходе из PRO-канала. Гасим ТОЛЬКО подписки с
 *  plan="tribute" (базовые/оплаченные иначе — не трогаем). Возвращает почту. */
export function revokeTribute(telegramId: number): string | null {
  const email = findEmailByTelegram(telegramId);
  if (!email) return null;
  const users = readUsers();
  const u = users[email];
  if (u?.subscription?.plan === "tribute" && (u.subscription.until ?? 0) > Date.now()) {
    u.subscription.until = Date.now(); // мгновенно гасим
    writeUsers(users);
  }
  return email;
}

/** Уже обработан этот платёж? (идемпотентность вебхука — YooKassa может
 *  прислать одно и то же событие несколько раз). */
export function isPaymentApplied(email: string, paymentId: string): boolean {
  const u = readUsers()[norm(email)];
  return !!u?.subscription?.lastPaymentId && u.subscription.lastPaymentId === paymentId;
}

// ── Лог платежей (payments.json) ──
export type PaymentRecord = {
  id: string; email: string; amount: string; planId: string; months: number;
  at: number; result: "granted" | "no_user";
};
function readPayments(): PaymentRecord[] {
  try {
    if (fs.existsSync(PAYMENTS_FILE)) return JSON.parse(fs.readFileSync(PAYMENTS_FILE, "utf-8"));
  } catch {}
  return [];
}
/** Этот платёж уже в логе? (идемпотентность даже для платежей без аккаунта —
 *  иначе reconcile каждую минуту слал бы повторные уведомления). */
export function isPaymentLogged(id: string): boolean {
  return readPayments().some((p) => p.id === id);
}
export function logPayment(rec: PaymentRecord) {
  const arr = readPayments();
  arr.push(rec);
  const tmp = PAYMENTS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(arr, null, 2), "utf-8");
  fs.renameSync(tmp, PAYMENTS_FILE);
}
