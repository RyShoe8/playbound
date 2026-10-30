import { NextResponse } from "next/server";
import mongoose from "mongoose";
import dbConnect from "@/lib/db";
import "@/lib/models/allModels";
import { ensureIndexes } from "@/lib/ensureIndexes";
import { cronAuthorized } from "@/lib/cronAuth";

export const maxDuration = 300;

/**
 * Hourly: create indexes the models declare that the database is missing (never drops any). Live
 * requests no longer build indexes (autoIndex is off in production), so a new index lands here
 * within the hour after a deploy. One collection at a time keeps it light on the pool.
 */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    await dbConnect();
    const result = await ensureIndexes(Object.values(mongoose.models), { apply: true, budgetMs: 240_000 });
    return NextResponse.json(result, { status: result.failed.length ? 207 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[indexes] cron failed: ${message}`);
    return NextResponse.json({ error: message.slice(0, 300) }, { status: 503 });
  }
}
