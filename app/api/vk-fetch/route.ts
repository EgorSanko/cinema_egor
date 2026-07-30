import { NextRequest, NextResponse } from "next/server";

// Обходной канал к VK для бэкенда Alloha.
//
// Зачем: VK-эдж тротлит по IP. Когда IP бэкенда (LeadSeek) попадает под лимит,
// он получает 403 на манифесты/сегменты — и «Плеер 1» умирает у всех, хотя
// ссылки живые: та же ссылка с ЭТОГО сервера отдаётся 200 (проверено).
// Бэкенд при 403 повторяет запрос сюда, мы тянем с нашего IP и отдаём байты.
//
// Защита: (1) секретный ключ (тот же ALLOHA_VKH_KEY), (2) пускаем ТОЛЬКО
// vkvideo.cloud — иначе получился бы открытый прокси.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VKH_URL = "https://kino.lead-seek.ru/hdrezka/api/alloha-vkh";
let hdrCache: { at: number; h: Record<string, string> } | null = null;

async function signedHeaders(key: string): Promise<Record<string, string> | null> {
  if (hdrCache && Date.now() - hdrCache.at < 10 * 60 * 1000) return hdrCache.h;
  try {
    const r = await fetch(`${VKH_URL}?k=${encodeURIComponent(key)}`);
    if (!r.ok) return null;
    const h = (await r.json()) as Record<string, string>;
    hdrCache = { at: Date.now(), h };
    return h;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const key = process.env.ALLOHA_VKH_KEY || "";
  if (!key || sp.get("k") !== key) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = sp.get("u") || "";
  let target: URL;
  try {
    const std = raw.replace(/-/g, "+").replace(/_/g, "/");
    const dec = Buffer.from(std + "=".repeat((4 - (std.length % 4)) % 4), "base64").toString("utf8");
    target = new URL(dec.split(" or ")[0].trim());
  } catch {
    return NextResponse.json({ error: "bad u" }, { status: 400 });
  }
  if (!/(^|\.)vkvideo\.cloud$/i.test(target.hostname) || target.protocol !== "https:") {
    return NextResponse.json({ error: "host not allowed" }, { status: 403 });
  }

  const headers = await signedHeaders(key);
  if (!headers) return NextResponse.json({ error: "no headers" }, { status: 502 });

  const range = req.headers.get("range");
  const up = { ...headers, ...(range ? { Range: range } : {}) };

  let r: Response;
  try {
    r = await fetch(target.toString(), { headers: up, redirect: "follow" });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message || e).slice(0, 120) }, { status: 502 });
  }
  if (!r.ok && r.status !== 206) {
    return NextResponse.json({ error: `upstream ${r.status}` }, { status: r.status });
  }

  const out = new Headers();
  out.set("Content-Type", r.headers.get("content-type") || "application/octet-stream");
  for (const h of ["content-length", "content-range", "accept-ranges"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  out.set("Cache-Control", "no-store");
  return new Response(r.body, { status: r.status, headers: out });
}
