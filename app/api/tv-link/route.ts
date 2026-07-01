import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

/**
 * QR device-link LOGIN.
 *
 * A device that's hard to type on (TV) — or any device — shows a QR encoding
 * `/link/<code>`. The user's phone (already logged in) opens it and confirms;
 * the confirming device then polls `status` and logs in as the confirmed user.
 *
 *   create  → { code }                     (called by TV/website, shows the QR)
 *   confirm → { code, user:{email,name} }  (called by the phone after scan)
 *   status  → { status, user? }            (polled by TV/website)
 *
 * Sessions live in memory only (single standalone process, like /api/auth's
 * pending map and /api/tv-room). A server restart just voids open codes — the
 * device re-creates one. Codes are single-use and expire in 5 minutes.
 */

type LinkSession = {
  status: "pending" | "authorized";
  user: { email: string; name: string } | null;
  intent: string; // "tv" | "web" — just for the phone-side copy
  createdAt: number;
  expires: number;
};

// Survive Next's dev/HMR module reloads by stashing on globalThis.
const g = globalThis as unknown as { __tvLink?: Map<string, LinkSession> };
const sessions: Map<string, LinkSession> = g.__tvLink || (g.__tvLink = new Map());

const TTL = 5 * 60 * 1000;
// Unambiguous alphabet (no 0/O/1/I/l) — short, URL-safe, human-typable fallback.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function genCode(len = 8): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function sweep() {
  const now = Date.now();
  for (const [code, s] of sessions) if (now > s.expires) sessions.delete(code);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const action = body.action as string;
  sweep();

  if (action === "create") {
    let code = genCode();
    while (sessions.has(code)) code = genCode();
    const now = Date.now();
    sessions.set(code, {
      status: "pending",
      user: null,
      intent: body.intent === "web" ? "web" : "tv",
      createdAt: now,
      expires: now + TTL,
    });
    return NextResponse.json({ code, ttl: TTL });
  }

  if (action === "confirm") {
    const code = String(body.code || "").toUpperCase();
    const email = String(body.user?.email || "").trim().toLowerCase();
    const name = String(body.user?.name || "").trim() || email.split("@")[0];
    if (!code || !email) return NextResponse.json({ error: "bad request" }, { status: 400 });
    const s = sessions.get(code);
    if (!s) return NextResponse.json({ error: "Код не найден или истёк" }, { status: 404 });
    if (Date.now() > s.expires) { sessions.delete(code); return NextResponse.json({ error: "Код истёк" }, { status: 410 }); }
    s.status = "authorized";
    s.user = { email, name };
    return NextResponse.json({ success: true });
  }

  if (action === "status") {
    const code = String(body.code || "").toUpperCase();
    const s = sessions.get(code);
    if (!s) return NextResponse.json({ status: "expired" });
    if (Date.now() > s.expires) { sessions.delete(code); return NextResponse.json({ status: "expired" }); }
    if (s.status === "authorized") {
      // Single-use: hand the user over once, then void the code.
      const user = s.user;
      sessions.delete(code);
      return NextResponse.json({ status: "authorized", user });
    }
    return NextResponse.json({ status: "pending" });
  }

  // Lightweight lookup for the phone page (does the code exist / its intent?).
  if (action === "info") {
    const code = String(body.code || "").toUpperCase();
    const s = sessions.get(code);
    if (!s || Date.now() > s.expires) return NextResponse.json({ valid: false });
    return NextResponse.json({ valid: true, intent: s.intent });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
