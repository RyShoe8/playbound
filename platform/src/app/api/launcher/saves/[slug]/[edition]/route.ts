import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";
import {
  r2Configured,
  listRemoteSnapshots,
  presignUpload,
  deleteSnapshot,
  saveKey,
} from "@/lib/saves/r2";

export const runtime = "nodejs";

/**
 * Cloud saves for one game+edition.
 *
 * GET  — what this account already has stored.
 * POST — mint a presigned URL so the launcher can upload straight to R2.
 *
 * Save archives never travel through this route. Vercel caps request bodies
 * well below the size a save can reach, so the only workable shape is to sign
 * a URL and let the launcher talk to storage directly — which also keeps game
 * saves out of our logs.
 */

/** Free accounts keep one snapshot per game; older ones are pruned on upload. */
const FREE_KEEP_PER_GAME = 1;
const FREE_MAX_BYTES = 250 * 1024 * 1024;

function planFor(user: { role?: string; tester?: boolean }) {
  // Subscriptions do not exist yet. Kept as a lookup rather than a constant so
  // raising the ceiling later is a data change, not a hunt through this file.
  void user;
  return { keepPerGame: FREE_KEEP_PER_GAME, maxBytes: FREE_MAX_BYTES };
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; edition: string }> }
) {
  const { slug, edition } = await params;
  const user = await userFromLauncherBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) {
    return NextResponse.json({ error: "Cloud saves are not configured" }, { status: 503 });
  }

  try {
    const snapshots = await listRemoteSnapshots({
      userId: String(user._id),
      gameSlug: slug,
      editionSlug: edition,
    });
    return NextResponse.json({ snapshots, plan: planFor(user) });
  } catch (err) {
    console.error("[saves] list failed", err);
    return NextResponse.json({ error: "Could not list cloud saves" }, { status: 502 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string; edition: string }> }
) {
  const { slug, edition } = await params;
  const user = await userFromLauncherBearer(req);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!r2Configured()) {
    return NextResponse.json({ error: "Cloud saves are not configured" }, { status: 503 });
  }

  let body: { snapshotId?: string; bytes?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const snapshotId = String(body.snapshotId || "").trim();
  const bytes = Number(body.bytes || 0);
  if (!snapshotId) return NextResponse.json({ error: "snapshotId is required" }, { status: 400 });
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return NextResponse.json({ error: "bytes must be a positive number" }, { status: 400 });
  }

  const plan = planFor(user);
  if (bytes > plan.maxBytes) {
    // Refused before signing rather than after uploading, so a player is not
    // charged a 300MB upload to be told it was too big.
    return NextResponse.json(
      {
        error: "too-large",
        message: `Saves are ${(bytes / 1048576).toFixed(0)}MB; the limit is ${(
          plan.maxBytes / 1048576
        ).toFixed(0)}MB.`,
        maxBytes: plan.maxBytes,
      },
      { status: 413 }
    );
  }

  const userId = String(user._id);

  try {
    /*
     * Prune before signing, not after. If the upload is what triggers cleanup
     * and it never completes, the account is left holding an extra snapshot it
     * is not entitled to; doing it first means the quota is always honoured.
     */
    const existing = await listRemoteSnapshots({
      userId,
      gameSlug: slug,
      editionSlug: edition,
    });
    const excess = existing.slice(Math.max(0, plan.keepPerGame - 1));
    await Promise.all(excess.map((s) => deleteSnapshot(s.key)));

    const key = saveKey({ userId, gameSlug: slug, editionSlug: edition, snapshotId });
    const uploadUrl = await presignUpload(key, bytes);

    return NextResponse.json({ uploadUrl, key, snapshotId, pruned: excess.length });
  } catch (err) {
    console.error("[saves] presign failed", err);
    return NextResponse.json({ error: "Could not prepare upload" }, { status: 502 });
  }
}
