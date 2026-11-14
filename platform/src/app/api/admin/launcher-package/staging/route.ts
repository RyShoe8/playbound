import { del, list } from "@vercel/blob";
import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/requireAdmin";

const SLUG = /^[a-z0-9][a-z0-9-]{0,119}$/;

/** Remove the Vercel Blob staging copies of a game's launcher packages.
 *
 * Existing uploads used browser -> Blob -> VPS. Once the S3 gateway is active,
 * new uploads use Blob only as temporary staging and clean it up on completion.
 * This explicit cleanup remains for older staged files. It is scoped to one
 * game's package folder and never touches the mirror or the catalog. */
export async function DELETE(req: Request) {
  const { error } = await requireAdminSession();
  if (error) return error;
  const params = new URL(req.url).searchParams;
  const gameSlug = params.get("gameSlug") || "";
  const editionSlug = params.get("editionSlug") || "";
  if (!SLUG.test(gameSlug) || (editionSlug && !SLUG.test(editionSlug))) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json({ error: "Blob storage is not configured" }, { status: 503 });
  }
  const prefix = editionSlug
    ? `launcher-packages/editions/${gameSlug}/${editionSlug}/`
    : `launcher-packages/games/${gameSlug}/`;
  const urls: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor });
    for (const blob of page.blobs) urls.push(blob.url);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  if (urls.length > 0) await del(urls);
  return NextResponse.json({ success: true, prefix, deleted: urls.length });
}
