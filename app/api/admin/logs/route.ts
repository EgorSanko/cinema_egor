import { NextRequest } from "next/server";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import path from "path";

/**
 * Live PM2 log viewer via Server-Sent Events.
 *
 * Streams `tail -f` of kino-web's PM2 stdout+stderr to the browser. The
 * page at /admin/logs subscribes via EventSource and renders incoming
 * lines. Lets you debug prod from a phone without SSH-ing into the VPS.
 *
 * Auth: ?token=<env ADMIN_TOKEN>. Set ADMIN_TOKEN in /root/movie/.env.local
 * and restart kino-web. No token configured = endpoint refuses everyone.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

// PM2 default log paths on the VPS. Falls back to common alternatives if
// the env hasn't been set up so the endpoint still works during local dev.
function findLogPaths(): string[] {
  const candidates = [
    "/root/.pm2/logs/kino-web-out.log",
    "/root/.pm2/logs/kino-web-error.log",
    "/root/.pm2/logs/kino-api-out.log",
    "/root/.pm2/logs/kino-api-error.log",
    "/root/.pm2/logs/kino-socket-out.log",
  ];
  return candidates.filter(p => {
    try { return fs.existsSync(p); } catch { return false; }
  });
}

export async function GET(req: NextRequest) {
  if (!ADMIN_TOKEN) {
    return new Response("Admin token not configured", { status: 503 });
  }
  const provided = req.nextUrl.searchParams.get("token");
  if (provided !== ADMIN_TOKEN) {
    return new Response("Unauthorized", { status: 401 });
  }

  const paths = findLogPaths();
  if (paths.length === 0) {
    return new Response("No PM2 logs found at expected paths", { status: 404 });
  }

  const encoder = new TextEncoder();
  let tail: ChildProcess | null = null;
  let heartbeat: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    start(controller) {
      // Send first 200 historical lines so user sees recent context, not
      // a blank screen until something new gets written.
      try {
        for (const p of paths) {
          const head = (() => {
            try {
              const data = fs.readFileSync(p, "utf-8");
              const lines = data.split("\n");
              return lines.slice(-50).filter(Boolean);
            } catch { return []; }
          })();
          for (const line of head) {
            const tag = path.basename(p, ".log");
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ src: tag, line })}\n\n`));
          }
        }
      } catch {}

      tail = spawn("tail", ["-n", "0", "-F", ...paths]);
      let buffer = "";
      let currentSrc = "";

      tail.stdout?.on("data", (chunk: Buffer) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n");
        buffer = parts.pop() || "";
        for (const raw of parts) {
          // tail -F prints `==> /path/to/file.log <==` on file switches.
          const switchMatch = raw.match(/^==> (.+) <==$/);
          if (switchMatch) {
            currentSrc = path.basename(switchMatch[1], ".log");
            continue;
          }
          if (!raw) continue;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ src: currentSrc, line: raw })}\n\n`));
          } catch {}
        }
      });
      tail.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString();
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ src: "tail-stderr", line: text })}\n\n`));
        } catch {}
      });
      tail.on("exit", () => {
        try { controller.close(); } catch {}
      });

      // EventSource closes silently if no data flows for a while; send a
      // comment ping every 25s to keep proxies (nginx, Cloudflare) from
      // dropping the connection at 60s idle timeout.
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch {}
      }, 25000);
    },
    cancel() {
      if (tail) { try { tail.kill("SIGTERM"); } catch {} tail = null; }
      if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-store, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx buffering on this response
    },
  });
}
