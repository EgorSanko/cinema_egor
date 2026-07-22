import "server-only";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Мост Tribute → сайт. Кнопка «Купить PRO» создаёт короткий одноразовый id,
// кодирующий почту аккаунта, и открывает бота (t.me/бот?start=<id>). Бот через
// /api/tribute/link меняет id на почту и привязывает Telegram ID. Дальше
// членство в PRO-канале = активный PRO (бот сверяет и продлевает).

const PENDING_FILE = path.join(process.cwd(), "tribute-pending.json");
const TTL_MS = 24 * 3600 * 1000;

type Pending = Record<string, { email: string; at: number }>;

function read(): Pending {
  try {
    if (fs.existsSync(PENDING_FILE)) return JSON.parse(fs.readFileSync(PENDING_FILE, "utf-8"));
  } catch {}
  return {};
}
function write(p: Pending) {
  const tmp = PENDING_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2), "utf-8");
  fs.renameSync(tmp, PENDING_FILE);
}
function rid(): string {
  const c = "abcdefghijklmnopqrstuvwxyz0123456789";
  const buf = crypto.randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += c[buf[i] % c.length];
  return s;
}

/** Создать pending-связку почта→id для deep-link бота. Заодно чистим протухшие. */
export function createPendingLink(email: string): string {
  const p = read();
  const now = Date.now();
  for (const k of Object.keys(p)) if (now - p[k].at > TTL_MS) delete p[k];
  const id = rid();
  p[id] = { email: email.trim().toLowerCase(), at: now };
  write(p);
  return id;
}

/** id → почта (не одноразовый: держим до TTL, чтобы повторный /start не ломался). */
export function resolvePending(id: string): string | null {
  if (!id) return null;
  const rec = read()[id];
  if (!rec) return null;
  if (Date.now() - rec.at > TTL_MS) return null;
  return rec.email;
}

/** Внутренний секрет бот↔сайт (свой TRIBUTE_KEY или общий RECONCILE_KEY). */
export function checkTributeSecret(s: unknown): boolean {
  const want = process.env.TRIBUTE_KEY || process.env.RECONCILE_KEY || "";
  return !!want && typeof s === "string" && s === want;
}

export const TRIBUTE_BOT = process.env.TRIBUTE_BOT || "sapkeflykino_bot";
export const TRIBUTE_WEB = process.env.TRIBUTE_WEB || "https://web.tribute.tg/s/11nC";
