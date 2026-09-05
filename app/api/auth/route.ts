import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { sendCode, isEmailConfigured } from "@/lib/email";
import { issueToken } from "@/lib/token-server";

// Успешный вход/verify/reset: отдаём юзера + ставим cookie kino_sub (подписанный
// токен) — по нему nginx-гейт пускает к Pro-стримам. Не httpOnly, чтобы фронт мог
// снять его при logout; подделать нельзя (HMAC), а без активной подписки он и так
// бесполезен.
function authSuccess(email: string, user: { email: string; name: string }) {
  const res = NextResponse.json({ success: true, user });
  const token = issueToken(email);
  if (token) res.cookies.set("kino_sub", token, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
  return res;
}

const USERS_FILE = path.join(process.cwd(), "users.json");

type StoredUser = { email: string; password: string; name: string; verified?: boolean; subscription?: unknown; createdAt?: number };

function getUsers(): Record<string, StoredUser> {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {}
  return {};
}
function saveUsers(users: Record<string, StoredUser>) {
  // Атомарно (tmp+rename): иначе параллельная запись из начислений/крона может
  // прочитать полу-записанный JSON или перетереть аккаунт.
  const tmp = USERS_FILE + ".tmp-auth";
  fs.writeFileSync(tmp, JSON.stringify(users, null, 2), "utf-8");
  fs.renameSync(tmp, USERS_FILE);
}

// Existing accounts predate verification — treat anyone already in users.json
// (or explicitly verified:true) as verified so we never lock current users out.
function isVerified(u: StoredUser | undefined): boolean {
  return !!u && u.verified !== false;
}

// Short-lived codes, in-memory (a server restart just makes users re-request).
type Pending = {
  type: "register" | "reset";
  codeHash: string;
  name?: string;
  passwordHash?: string;
  expires: number;
  attempts: number;
  lastSent: number;
};
const pending = new Map<string, Pending>();
const CODE_TTL = 15 * 60 * 1000;
const RESEND_COOLDOWN = 60 * 1000;
const MAX_ATTEMPTS = 5;

const norm = (e: string) => e.trim().toLowerCase();
const genCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
const hashCode = (c: string) => crypto.createHash("sha256").update(c).digest("hex");

async function issueCode(
  email: string,
  type: "register" | "reset",
  extra: Partial<Pending> = {}
): Promise<{ sent: boolean; devCode?: string }> {
  const code = genCode();
  pending.set(email, {
    type,
    codeHash: hashCode(code),
    expires: Date.now() + CODE_TTL,
    attempts: 0,
    lastSent: Date.now(),
    ...extra,
  });
  const sent = await sendCode(email, code, type === "register" ? "verify" : "reset");
  // Bootstrap escape hatch: surface the code in the response ONLY when explicitly
  // enabled (e.g. before SMTP is wired). Off by default — codes never leak.
  const devCode = process.env.AUTH_DEV_CODES === "true" ? code : undefined;
  return { sent, devCode };
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  const email = body.email ? norm(body.email) : "";
  const { password, name, code } = body;

  const users = getUsers();

  // ---- REGISTER: stage a pending account + email a verification code ----
  if (action === "register") {
    if (!email || !password) return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Введите имя" }, { status: 400 });
    if (password.length < 6) return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
    if (users[email] && isVerified(users[email]))
      return NextResponse.json({ error: "Пользователь уже существует" }, { status: 400 });

    const passwordHash = await bcrypt.hash(password, 10);
    const { devCode } = await issueCode(email, "register", { name, passwordHash });
    return NextResponse.json({ pending: true, email, emailSent: isEmailConfigured(), devCode });
  }

  // ---- VERIFY REGISTRATION ----
  if (action === "verify") {
    const p = pending.get(email);
    if (!p || p.type !== "register") return NextResponse.json({ error: "Запросите код заново" }, { status: 400 });
    if (Date.now() > p.expires) { pending.delete(email); return NextResponse.json({ error: "Код истёк, запросите новый" }, { status: 400 }); }
    if (p.attempts >= MAX_ATTEMPTS) { pending.delete(email); return NextResponse.json({ error: "Слишком много попыток, запросите новый код" }, { status: 400 }); }
    if (hashCode(String(code || "")) !== p.codeHash) {
      p.attempts++;
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }
    // Сохраняем существующие поля (напр. subscription из shadow-записи, если
    // человек оплатил Про ДО регистрации) — иначе подписка потеряется.
    // createdAt — момент завершения регистрации. От него отсчитываются
    // подарочные дни PRO новичку. Ставим только если его ещё нет: повторная
    // верификация не должна обнулять отсчёт и выдавать триал заново.
    users[email] = { ...(users[email] || {}), email, password: p.passwordHash!, name: p.name || users[email]?.name || email.split("@")[0], verified: true, createdAt: users[email]?.createdAt || Date.now() };
    saveUsers(users);
    pending.delete(email);
    return authSuccess(email, { email, name: users[email].name });
  }

  // ---- CHECK: существует ли реальный подтверждённый аккаунт (для валидации
  // сохранённой сессии; phantom/shadow без пароля → exists:false → фронт
  // разлогинит и попросит подтвердить). ----
  if (action === "check") {
    const u = users[email];
    const exists = !!u && !!u.password && u.verified !== false;
    const res = NextResponse.json({ exists });
    // Обновляем cookie гейта для уже-залогиненных (ставится на каждой загрузке) —
    // чтобы существующие подписчики получили токен без повторного входа.
    if (exists) {
      const t = issueToken(email);
      if (t) res.cookies.set("kino_sub", t, { path: "/", maxAge: 60 * 60 * 24 * 180, sameSite: "lax" });
    }
    return res;
  }

  // ---- LOGIN ----
  if (action === "login") {
    const user = users[email];
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 401 });
    const valid = await bcrypt.compare(password || "", user.password);
    if (!valid) return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });
    return authSuccess(user.email, { email: user.email, name: user.name });
  }

  // ---- FORGOT PASSWORD: email a reset code (generic response, no enumeration) ----
  if (action === "forgot") {
    if (!email) return NextResponse.json({ error: "Введите email" }, { status: 400 });
    let devCode: string | undefined;
    if (users[email]) ({ devCode } = await issueCode(email, "reset"));
    return NextResponse.json({ success: true, emailSent: isEmailConfigured(), devCode });
  }

  // ---- RESET PASSWORD with code ----
  if (action === "reset") {
    if (!password || password.length < 6) return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
    const p = pending.get(email);
    if (!p || p.type !== "reset") return NextResponse.json({ error: "Запросите код заново" }, { status: 400 });
    if (Date.now() > p.expires) { pending.delete(email); return NextResponse.json({ error: "Код истёк, запросите новый" }, { status: 400 }); }
    if (p.attempts >= MAX_ATTEMPTS) { pending.delete(email); return NextResponse.json({ error: "Слишком много попыток, запросите новый код" }, { status: 400 }); }
    if (hashCode(String(code || "")) !== p.codeHash) {
      p.attempts++;
      return NextResponse.json({ error: "Неверный код" }, { status: 400 });
    }
    const user = users[email];
    if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 400 });
    user.password = await bcrypt.hash(password, 10);
    user.verified = true;
    saveUsers(users);
    pending.delete(email);
    return authSuccess(user.email, { email: user.email, name: user.name });
  }

  // ---- RESEND code (register or reset), with cooldown ----
  if (action === "resend") {
    const p = pending.get(email);
    if (!p) return NextResponse.json({ error: "Нечего отправлять, начните заново" }, { status: 400 });
    if (Date.now() - p.lastSent < RESEND_COOLDOWN)
      return NextResponse.json({ error: "Подождите минуту перед повторной отправкой" }, { status: 429 });
    const { devCode } = await issueCode(email, p.type, { name: p.name, passwordHash: p.passwordHash });
    return NextResponse.json({ success: true, emailSent: isEmailConfigured(), devCode });
  }

  return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
