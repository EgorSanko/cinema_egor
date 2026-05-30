import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type { Ticket } from "../../route";

/**
 * Serves the screenshot attached to a ticket.
 *
 * Auth: admin can view any; the ticket author can view their own. Without a
 * check anyone with the ticket id could enumerate user-submitted images,
 * which sometimes contain sensitive things (account email visible on screen,
 * personal data behind the bug, etc).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TICKETS_DIR = process.env.TICKETS_DIR
  || path.join(process.cwd(), "tickets");
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function isAdmin(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const email = (req.nextUrl.searchParams.get("email") || "").trim().toLowerCase();

  const ticketJson = path.join(TICKETS_DIR, id, "ticket.json");
  let ticket: Ticket;
  try {
    ticket = JSON.parse(fs.readFileSync(ticketJson, "utf-8"));
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!ticket.hasScreenshot || !ticket.screenshotExt) {
    return NextResponse.json({ error: "No screenshot" }, { status: 404 });
  }
  if (!isAdmin(email) && ticket.email !== email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const file = path.join(TICKETS_DIR, id, `screenshot.${ticket.screenshotExt}`);
  try {
    const buf = fs.readFileSync(file);
    const mime =
      ticket.screenshotExt === "png" ? "image/png" :
      ticket.screenshotExt === "webp" ? "image/webp" : "image/jpeg";
    return new Response(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": mime,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
