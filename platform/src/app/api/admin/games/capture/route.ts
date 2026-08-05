import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { z } from "zod";
import { compressImageBuffer } from "@/lib/compressImage";
import { requireAdminSession } from "@/lib/requireAdmin";

const schema = z.object({
  url: z.string().trim().url().max(500),
  slug: z.string().trim().max(80).optional(),
});

export async function GET() {
  const { error } = await requireAdminSession();
  if (error) return error;
  return NextResponse.json({
    available: Boolean(process.env.MICROLINK_API_KEY && process.env.BLOB_READ_WRITE_TOKEN),
    microlink: Boolean(process.env.MICROLINK_API_KEY),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  });
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    if (!process.env.MICROLINK_API_KEY) {
      return NextResponse.json(
        { error: "MICROLINK_API_KEY is not configured — use Fetch from website or Upload instead" },
        { status: 503 }
      );
    }
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is required to store captured screenshots" },
        { status: 503 }
      );
    }

    const { url, slug } = schema.parse(await req.json());
    const api = new URL("https://api.microlink.io");
    api.searchParams.set("url", url);
    api.searchParams.set("screenshot", "true");
    api.searchParams.set("meta", "false");
    api.searchParams.set("embed", "screenshot.url");

    const res = await fetch(api.toString(), {
      headers: {
        "x-api-key": process.env.MICROLINK_API_KEY,
        "user-agent": "PlayBoundAdmin/1.0",
      },
      next: { revalidate: 0 },
    });
    const data = (await res.json().catch(() => null)) as {
      status?: string;
      data?: { screenshot?: { url?: string } };
      message?: string;
    } | null;

    const shotUrl = data?.data?.screenshot?.url;
    if (!res.ok || !shotUrl) {
      return NextResponse.json(
        { error: data?.message || "Microlink could not capture a screenshot" },
        { status: 502 }
      );
    }

    const imgRes = await fetch(shotUrl);
    if (!imgRes.ok) {
      return NextResponse.json({ error: "Failed to download captured screenshot" }, { status: 502 });
    }
    const bytes = Buffer.from(await imgRes.arrayBuffer());
    let compressed;
    try {
      compressed = await compressImageBuffer(bytes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid capture image";
      return NextResponse.json({ error: message }, { status: 502 });
    }
    const safeSlug = (slug || "capture").replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
    const blob = await put(
      `games/${safeSlug}/capture-${Date.now()}.${compressed.extension}`,
      compressed.buffer,
      {
        access: "public",
        contentType: compressed.contentType,
        token: process.env.BLOB_READ_WRITE_TOKEN,
      }
    );

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid" }, { status: 400 });
    }
    console.error("Capture error:", err);
    return NextResponse.json({ error: "Capture failed" }, { status: 500 });
  }
}
