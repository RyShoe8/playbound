import { NextResponse, connection } from "next/server";
import { catalog } from "@/lib/mixtape/service";
export async function GET() {
  await connection();
  return NextResponse.json(await catalog(), { headers: { "Cache-Control": "no-store" } });
}
