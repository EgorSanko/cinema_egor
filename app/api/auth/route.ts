import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";

const USERS_FILE = path.join(process.cwd(), "users.json");

function getUsers(): Record<string, { email: string; password: string; name: string }> {
try {
if (fs.existsSync(USERS_FILE)) {
return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
}
} catch {}
return {};
}

function saveUsers(users: Record<string, any>) {
fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export async function POST(req: NextRequest) {
const body = await req.json();
const { action, email, password, name } = body;

if (!email || !password) {
return NextResponse.json({ error: "Введите email и пароль" }, { status: 400 });
}

const users = getUsers();

if (action === "register") {
if (!name) return NextResponse.json({ error: "Введите имя" }, { status: 400 });
if (users[email]) return NextResponse.json({ error: "Пользователь уже существует" }, { status: 400 });
if (password.length < 6) return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });

const hashed = await bcrypt.hash(password, 10);
users[email] = { email, password: hashed, name };
saveUsers(users);

return NextResponse.json({ success: true, user: { email, name } });
}

if (action === "login") {
const user = users[email];
if (!user) return NextResponse.json({ error: "Пользователь не найден" }, { status: 401 });

const valid = await bcrypt.compare(password, user.password);
if (!valid) return NextResponse.json({ error: "Неверный пароль" }, { status: 401 });

return NextResponse.json({ success: true, user: { email: user.email, name: user.name } });
}

return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
}
