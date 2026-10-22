import { NextResponse } from "next/server";

// Promote to R2 writes the signed latest.yml to Blob before exposing the
// release. Serving that durable copy keeps update checks independent of MongoDB.
// The admin feed is uploaded to the same store by upload:launcher.
const FEED_BASE = "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ feed: string }> }
) {
  const { feed } = await params;
  return NextResponse.redirect(`${FEED_BASE}${encodeURIComponent(feed)}`, 307);
}
