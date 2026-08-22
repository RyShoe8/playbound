import { NextResponse } from "next/server";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  createCouchSession,
  publicCouchSnapshot,
} from "@/lib/couch/sessionManager";
import { SITE_URL } from "@/lib/site";

/**
 * POST /api/couch/sessions — host creates a Couch Mode session.
 */
export async function POST(req: Request) {
  try {
    await ensureCouchStore();
    const body = await req.json().catch(() => ({}));
    const session = await createCouchSession({
      hostLabel: typeof body.hostLabel === "string" ? body.hostLabel : "PlayBound",
      maxPlayers: typeof body.maxPlayers === "number" ? body.maxPlayers : undefined,
      autoApprove: body.autoApprove !== false,
    });

    const joinPath = `/controller/${session.joinCode}`;
    return NextResponse.json(
      {
        sessionId: session.sessionId,
        joinCode: session.joinCode,
        hostToken: session.hostToken,
        joinUrl: `${SITE_URL}${joinPath}`,
        joinPath,
        snapshot: publicCouchSnapshot(session),
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("POST /api/couch/sessions failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
