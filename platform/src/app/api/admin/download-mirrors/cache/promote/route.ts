import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { manualPromoteArtifact } from "@/lib/mirrors/cacheManager";

export async function POST(req: Request) {
  const { session, error } = await requireAdminSession();
  if (error) return error;

  try {
    const { artifactId } = await req.json();
    if (!artifactId) {
      return NextResponse.json({ error: "artifactId is required" }, { status: 400 });
    }

    const actor = session?.user?.name || session?.user?.email || "admin";
    const acceptsStream = req.headers.get("accept")?.includes("text/event-stream");

    if (acceptsStream) {
      const stream = new TransformStream();
      const writer = stream.writable.getWriter();
      const encoder = new TextEncoder();

      void (async () => {
        try {
          const result = await manualPromoteArtifact(artifactId, actor, (p) => {
            void writer.write(encoder.encode(`data: ${JSON.stringify({ type: "progress", ...p })}\n\n`));
          });

          if (!result.success) {
            void writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", error: result.message })}\n\n`));
          } else {
            void writer.write(
              encoder.encode(`data: ${JSON.stringify({ type: "done", success: true, queued: result.queued, message: result.message })}\n\n`)
            );
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Promotion failed";
          void writer.write(encoder.encode(`data: ${JSON.stringify({ type: "error", error: msg })}\n\n`));
        } finally {
          void writer.close();
        }
      })();

      return new Response(stream.readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await manualPromoteArtifact(artifactId, actor);

    if (!result.success) {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, queued: result.queued, message: result.message });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Promotion failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

