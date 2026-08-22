import { NextResponse } from "next/server";
import { ensureCouchStore } from "@/lib/couch/ensureStore";
import {
  getCouchSessionByCode,
  publicCouchSnapshot,
} from "@/lib/couch/sessionManager";

interface RouteContext {
  params: Promise<{ code: string }>;
}

export async function GET(_req: Request, context: RouteContext) {
  try {
    await ensureCouchStore();
    const { code } = await context.params;
    const session = await getCouchSessionByCode(code);
    if (!session) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    return NextResponse.json(publicCouchSnapshot(session));
  } catch (err) {
    console.error("GET /api/couch/code/[code] failed:", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
