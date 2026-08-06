import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { verifyToken } from "@/lib/token-server";

/**
 * Публичные отзывы к тайтлу (карточка TMDB целиком — НЕ сезон/серия/плеер).
 *
 * Личность берём из подписанной куки kino_sub (HMAC от почты, ставится при
 * входе) — поэтому подделать отзыв от чужого имени нельзя. Почту наружу НЕ
 * отдаём никогда: в публичном ответе только отображаемое имя.
 *
 * Хранилище — файл на тайтл рядом с профилями пользователей. Трафик у проекта
 * небольшой, база ради этого не нужна; при росте это первое, что переедет.
 */

const DATA_DIR = process.env.SYNC_DATA_DIR || path.join(process.cwd(), "user-data");
const REVIEWS_DIR = path.join(DATA_DIR, "reviews");

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || process.env.NEXT_PUBLIC_ADMIN_EMAILS || "")
  .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);

const MAX_TEXT = 500;
const MAX_PER_TITLE = 500;

type Review = {
  id: string;
  email: string;      // только на сервере, наружу не отдаём
  author: string;     // отображаемое имя
  text: string;
  rating: number;
  createdAt: number;
  updatedAt?: number;
};

function fileFor(type: string, id: string) {
  const safeType = type === "tv" ? "tv" : "movie";
  const safeId = String(id).replace(/[^0-9]/g, "");
  return path.join(REVIEWS_DIR, `${safeType}-${safeId}.json`);
}

function readAll(type: string, id: string): Review[] {
  try {
    const f = fileFor(type, id);
    if (!fs.existsSync(f)) return [];
    const d = JSON.parse(fs.readFileSync(f, "utf8"));
    return Array.isArray(d) ? d : [];
  } catch { return []; }
}

function writeAll(type: string, id: string, list: Review[]) {
  fs.mkdirSync(REVIEWS_DIR, { recursive: true });
  const f = fileFor(type, id);
  const tmp = f + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, MAX_PER_TITLE)));
  fs.renameSync(tmp, f); // атомарная замена — файл не увидят наполовину записанным
}

/** Почта пишущего из подписанной куки. null = не авторизован. */
function callerEmail(req: NextRequest): string | null {
  const t = req.cookies.get("kino_sub")?.value;
  if (!t) return null;
  const email = verifyToken(t);
  return email ? email.toLowerCase() : null;
}

/** Публичный вид: без почты. */
function publicView(r: Review, me: string | null) {
  return {
    id: r.id,
    author: r.author,
    text: r.text,
    rating: r.rating,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    mine: !!me && r.email === me,
  };
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  const type = searchParams.get("type") || "movie";
  if (!id) return NextResponse.json({ error: "no id" }, { status: 400 });
  const me = callerEmail(req);
  const list = readAll(type, id).sort((a, b) => b.createdAt - a.createdAt);
  const avg = list.length ? +(list.reduce((s, r) => s + r.rating, 0) / list.length).toFixed(1) : null;
  return NextResponse.json({ reviews: list.map((r) => publicView(r, me)), count: list.length, avg });
}

export async function POST(req: NextRequest) {
  const me = callerEmail(req);
  if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const id = String(body.mediaId || "");
  const type = body.mediaType === "tv" ? "tv" : "movie";
  const rating = Math.round(Number(body.rating) || 0);
  const text = String(body.text || "").trim().slice(0, MAX_TEXT);
  // Имя показываем из аккаунта. Почту в качестве имени НЕ пускаем ни при каких
  // условиях — иначе публичный отзыв раскроет почту автора.
  let author = String(body.author || "").trim().slice(0, 40);
  if (!author || author.includes("@")) author = "Гость";

  if (!id || rating < 1 || rating > 5 || !text) {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }

  const list = readAll(type, id);
  const now = Date.now();
  // Один отзыв на тайтл от человека: повторная отправка обновляет свой же.
  const existing = list.findIndex((r) => r.email === me);
  if (existing >= 0) {
    list[existing] = { ...list[existing], author, text, rating, updatedAt: now };
  } else {
    list.unshift({
      id: Math.random().toString(36).slice(2, 10) + now.toString(36),
      email: me, author, text, rating, createdAt: now,
    });
  }
  writeAll(type, id, list);
  return NextResponse.json({ ok: true, reviews: list.sort((a, b) => b.createdAt - a.createdAt).map((r) => publicView(r, me)) });
}

export async function DELETE(req: NextRequest) {
  const me = callerEmail(req);
  if (!me) return NextResponse.json({ error: "auth" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  const type = searchParams.get("type") || "movie";
  const rid = searchParams.get("rid") || "";
  if (!id || !rid) return NextResponse.json({ error: "no id" }, { status: 400 });

  const isAdmin = ADMIN_EMAILS.includes(me);
  const list = readAll(type, id);
  const target = list.find((r) => r.id === rid);
  if (!target) return NextResponse.json({ ok: true });
  // Удалять может только автор или админ.
  if (target.email !== me && !isAdmin) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const next = list.filter((r) => r.id !== rid);
  writeAll(type, id, next);
  return NextResponse.json({ ok: true, reviews: next.map((r) => publicView(r, me)) });
}
