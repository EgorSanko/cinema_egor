import "server-only";
import crypto from "crypto";
import fs from "fs";
import path from "path";

// Подписанный токен доступа = HMAC(секрет, email). Доказывает ЛИЧНОСТЬ (email),
// подделать нельзя (нет секрета). Подписку гейт проверяет отдельно по email —
// поэтому токен стабилен и не нужно перевыпускать при смене подписки.
// Секрет в файле рядом с users.json (не в git/бандле).
const F = path.join(process.cwd(), "subgate.json");

function secret(): string {
  try {
    return JSON.parse(fs.readFileSync(F, "utf-8")).secret || "";
  } catch {
    return "";
  }
}

export function issueToken(email: string): string {
  const e = String(email || "").trim().toLowerCase();
  const s = secret();
  if (!e || !s) return "";
  const sig = crypto.createHmac("sha256", s).update(e).digest("base64url");
  return Buffer.from(e).toString("base64url") + "." + sig;
}

export function verifyToken(token: string): string | null {
  if (!token || !token.includes(".")) return null;
  const [b64, sig] = token.split(".");
  let e = "";
  try {
    e = Buffer.from(b64, "base64url").toString("utf-8");
  } catch {
    return null;
  }
  const s = secret();
  if (!e || !s || !sig) return null;
  const expect = crypto.createHmac("sha256", s).update(e).digest("base64url");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expect);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return e;
  } catch {}
  return null;
}
