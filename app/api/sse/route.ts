// GET /api/sse — Server-Sent Events stream for the logged-in user.
// Pushes live notification events (see lib/notify.ts) so the bell icon
// updates instantly without polling. See lib/sse.ts for the deployment
// caveat (single-instance only, not multi-instance/serverless-safe).
import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { registerClient, unregisterClient } from "@/lib/sse";

export const dynamic = "force-dynamic";

// Each open stream holds a socket (and, with Redis, a pub/sub subscription). Without a cap one account
// (or a script) could open thousands and exhaust the instance. A normal user has 1–2 tabs.
const MAX_STREAMS_PER_USER = 5;
const openStreams = new Map<string, number>();

export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if (!auth.ok) {
    return new Response("Unauthorized", { status: auth.status });
  }
  const userId = auth.user.id;
  if ((openStreams.get(userId) ?? 0) >= MAX_STREAMS_PER_USER) {
    return new Response("Too many open streams", { status: 429, headers: { "Retry-After": "30" } });
  }
  openStreams.set(userId, (openStreams.get(userId) ?? 0) + 1);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    const left = (openStreams.get(userId) ?? 1) - 1;
    if (left <= 0) openStreams.delete(userId);
    else openStreams.set(userId, left);
  };

  const stream = new ReadableStream({
    start(controller) {
      const client = registerClient(userId, controller);

      // Initial comment line so the connection is confirmed open
      // immediately (some proxies buffer until the first byte).
      controller.enqueue(new TextEncoder().encode(": connected\n\n"));

      // Heartbeat keeps intermediary proxies/load balancers from closing
      // the connection as idle.
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": ping\n\n"));
        } catch {
          clearInterval(heartbeat);
          release();
        }
      }, 25000);

      request.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        release();
        unregisterClient(client);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
