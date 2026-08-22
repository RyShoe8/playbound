import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import { ensureMissingHostGames } from "@/lib/gameHost/client";

export async function POST() {
  const { error } = await requireAdminSession();
  if (error) return error;

  const result = await ensureMissingHostGames();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
