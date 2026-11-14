import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { headS3ArchiveObject, safeS3ArchiveKey, signedS3ArchiveDownloadUrl } from "@/lib/mirrors/s3Archive";

export const maxDuration = 15;

function authorized(req: Request): boolean {
  const secret = process.env.MIRROR_GATEWAY_SECRET;
  if (!secret) return false;
  const actual = Buffer.from(req.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function gameArchiveKey(raw: string | null): string {
  if (!raw || raw.length > 450) throw new Error("Invalid archive key");
  const key = safeS3ArchiveKey(raw);
  if (!key.startsWith("games/") && !key.startsWith("launcher-packages/")) {
    throw new Error("Not a game package");
  }
  return key;
}

/** Sign one short-lived private download for the edge mirror. No game bytes pass through Vercel. */
export async function GET(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let key: string;
  try {
    key = gameArchiveKey(new URL(req.url).searchParams.get("key"));
  } catch {
    return NextResponse.json({ error: "Invalid archive key" }, { status: 400 });
  }
  try {
    const head = await headS3ArchiveObject(key);
    if (!head.exists) return NextResponse.json({ error: "Game package unavailable" }, { status: 404 });
    const url = await signedS3ArchiveDownloadUrl(key, key.split("/").at(-1) || "download", 300);
    return NextResponse.json({ url, sizeBytes: head.sizeBytes }, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    console.error("Private game archive sign failed:", error instanceof Error ? error.name : "unknown");
    return NextResponse.json({ error: "Game archive temporarily unavailable" }, { status: 503 });
  }
}
