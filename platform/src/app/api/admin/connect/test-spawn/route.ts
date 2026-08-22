import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { triggerTestSpawn } from "@/lib/gameHost/client";

export async function POST(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    gameSlug?: string;
    all?: boolean;
  };

  const result = await triggerTestSpawn({
    gameSlug: body.gameSlug,
    all: Boolean(body.all),
  });

  return NextResponse.json(result, {
    status: result.ok ? 200 : result.result ? 409 : 502,
  });
}
