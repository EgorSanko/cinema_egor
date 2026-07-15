import "server-only";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// Креды YooKassa лежат в файле рядом с users.json (НЕ в git, НЕ в клиентском
// бандле). Формат: { "shopId": "...", "secretKey": "live_..." }.
const CREDS_FILE = path.join(process.cwd(), "yookassa.json");
const API = "https://api.yookassa.ru/v3";

type Creds = { shopId: string; secretKey: string };
export function getCreds(): Creds | null {
  try {
    if (fs.existsSync(CREDS_FILE)) {
      const c = JSON.parse(fs.readFileSync(CREDS_FILE, "utf-8"));
      if (c.shopId && c.secretKey) return c;
    }
  } catch {}
  return null;
}
export function isConfigured(): boolean {
  return !!getCreds();
}

function authHeader(c: Creds): string {
  return "Basic " + Buffer.from(`${c.shopId}:${c.secretKey}`).toString("base64");
}

export type CreatedPayment = { id: string; confirmationUrl: string } | { error: string };

export async function createPayment(opts: {
  amount: number;
  description: string;
  returnUrl: string;
  metadata: Record<string, string>;
}): Promise<CreatedPayment> {
  const c = getCreds();
  if (!c) return { error: "not_configured" };
  try {
    const r = await fetch(`${API}/payments`, {
      method: "POST",
      headers: {
        Authorization: authHeader(c),
        "Idempotence-Key": crypto.randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: { value: opts.amount.toFixed(2), currency: "RUB" },
        capture: true,
        confirmation: { type: "redirect", return_url: opts.returnUrl },
        description: opts.description,
        metadata: opts.metadata,
      }),
    });
    const j = await r.json();
    if (!r.ok || !j.id) return { error: j.description || `yk_http_${r.status}` };
    const url = j.confirmation?.confirmation_url;
    if (!url) return { error: "no_confirmation_url" };
    return { id: j.id, confirmationUrl: url };
  } catch (e) {
    return { error: "yk_exception:" + String((e as any)?.message || e) };
  }
}

// Список последних платежей (для авто-сверки: подтягиваем успешные, что не
// прошли через вебхук/возврат). Фильтруем по статусу succeeded.
export async function listSucceeded(limit = 20): Promise<any[]> {
  const c = getCreds();
  if (!c) return [];
  try {
    const r = await fetch(`${API}/payments?status=succeeded&limit=${limit}`, {
      headers: { Authorization: authHeader(c) },
    });
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.items) ? j.items : [];
  } catch {
    return [];
  }
}

// Верификация вебхука: НЕ доверяем телу уведомления, а перечитываем платёж из
// API по id и проверяем статус. Так спуфнутый вебхук не выдаст подписку.
export async function fetchPayment(id: string): Promise<any | null> {
  const c = getCreds();
  if (!c) return null;
  try {
    const r = await fetch(`${API}/payments/${id}`, { headers: { Authorization: authHeader(c) } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}
