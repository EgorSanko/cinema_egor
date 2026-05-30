import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { Ticket } from "../route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKETS_DIR = process.env.TICKETS_DIR
  || path.join(process.cwd(), "tickets");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

const ALLOWED_STATUSES = ["open", "in_progress", "resolved", "closed"] as const;
type Status = (typeof ALLOWED_STATUSES)[number];

function isAdmin(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

function ticketPath(id: string) {
  return path.join(TICKETS_DIR, id, "ticket.json");
}

function loadTicket(id: string): Ticket | null {
  try {
    return JSON.parse(fs.readFileSync(ticketPath(id), "utf-8"));
  } catch {
    return null;
  }
}

/** GET — admin reads single ticket, or its author reads their own ticket. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  const ticket = loadTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!isAdmin(email) && ticket.email !== email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ticket });
}

/** PATCH — admin updates status / adds a reply. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json();
  const email = String(body.email || "").trim().toLowerCase();
  if (!isAdmin(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ticket = loadTicket(id);
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.status && ALLOWED_STATUSES.includes(body.status)) {
    ticket.status = body.status as Status;
  }
  if (typeof body.reply === "string") {
    ticket.reply = body.reply.slice(0, 4000);
    ticket.repliedAt = Date.now();
    ticket.repliedBy = email;
    // Pushing a reply implicitly moves the ticket to in_progress, unless the
    // admin explicitly set a status in the same patch.
    if (!body.status) ticket.status = "in_progress";
  }

  fs.writeFileSync(ticketPath(id), JSON.stringify(ticket, null, 2));
  return NextResponse.json({ success: true, ticket });
}

/** DELETE — admin removes a ticket entirely (and its screenshot). */
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();
  if (!isAdmin(email)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dir = path.join(TICKETS_DIR, id);
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {}
  return NextResponse.json({ success: true });
}
