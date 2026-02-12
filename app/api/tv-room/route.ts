// app/api/tv-room/route.ts
import { NextResponse } from "next/server";

interface Room {
  code: string;
  stream: any | null;
  createdAt: number;
  connected: boolean;
}

const rooms = new Map<string, Room>();

function cleanup() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if (now - room.createdAt > 3600000) rooms.delete(code);
  }
}

function generateCode(): string {
  let code: string;
  do { code = String(Math.floor(1000 + Math.random() * 9000)); } while (rooms.has(code));
  return code;
}

export async function POST(req: Request) {
  cleanup();
  const body = await req.json();
  const { action, code, stream } = body;

  if (action === "create") {
    const c = generateCode();
    rooms.set(c, { code: c, stream: stream || null, createdAt: Date.now(), connected: false });
    return NextResponse.json({ code: c });
  }

  if (action === "join") {
    if (!code || !rooms.has(code)) return NextResponse.json({ error: "not_found" });
    const room = rooms.get(code)!;
    room.connected = true;
    return NextResponse.json({ stream: room.stream });
  }

  if (action === "status") {
    if (!code || !rooms.has(code)) return NextResponse.json({ connected: false, expired: true });
    return NextResponse.json({ connected: rooms.get(code)!.connected });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
