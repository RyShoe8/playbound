import { NextResponse } from "next/server";
import { userFromLauncherBearer } from "@/lib/library";
import {
  r2Configured,
  listRemoteSnapshots,
  presignDownload,
  saveKey,
  statSnapshot,
} from "@/lib/saves/r2";

export const runtime = "nodejs";

/**
 * Mint a presigned URL for pulling one snapshot back down.
 *
 * The key is rebuilt from the authenticated user rather than taken from the
 * request, so a caller cannot ask for a path belonging to someone else — the
 * only thing they control is which of *their* snapshots to fetch.
 *
 * ?snapshot=<id> picks one; omitting it returns the newest, which is what a
 * fresh install on a new machine wants.
 */
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

  const userId = String(user._id);
  const requested = new URL(req.url).searchParams.get("snapshot");

  try {
    let key: string;
    let snapshotId: string;

    if (requested) {
      snapshotId = requested;
      key = saveKey({ userId, gameSlug: slug, editionSlug: edition, snapshotId });
      if (!(await statSnapshot(key))) {
        return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
      }
    } else {
      const [newest] = await listRemoteSnapshots({
        userId,
        gameSlug: slug,
        editionSlug: edition,
      });
      if (!newest) return NextResponse.json({ error: "No cloud saves stored" }, { status: 404 });
      key = newest.key;
      snapshotId = newest.snapshotId;
    }

    const downloadUrl = await presignDownload(key);
    return NextResponse.json({ downloadUrl, snapshotId });
  } catch (err) {
    console.error("[saves] download presign failed", err);
    return NextResponse.json({ error: "Could not prepare download" }, { status: 502 });
  }
}
