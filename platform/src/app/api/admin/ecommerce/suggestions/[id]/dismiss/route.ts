import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";
import dbConnect from "@/lib/db";
import StoreMatchSuggestion from "@/lib/models/StoreMatchSuggestion";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const { id } = await ctx.params;
  await dbConnect();
  await StoreMatchSuggestion.updateOne({ _id: id }, { $set: { status: "dismissed" } });
  return NextResponse.json({ ok: true });
}
