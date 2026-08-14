import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminSession } from "@/lib/requireAdmin";
import { assertPublicHttpUrl } from "@/lib/pageMeta";
import { compressImageBuffer } from "@/lib/compressImage";
import { youtubeId, vimeoId } from "@/lib/mediaEmbed";

export const maxDuration = 60;

const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 80 * 1024 * 1024;

const schema = z.object({
  url: z.string().trim().min(1).max(2000),
  kind: z.enum(["image", "video"]),
  filename: z.string().trim().max(120).optional(),
});

function safeFilename(raw: string, fallback: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return (cleaned || fallback).slice(0, 120);
}

function isHls(url: string): boolean {
  try {
    const u = new URL(url);
    return /\.m3u8$/i.test(u.pathname) || /hls/i.test(u.pathname);
  } catch {
    return /\.m3u8/i.test(url);
  }
}

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    const body = schema.parse(await req.json());
    let target: URL;
    try {
      target = assertPublicHttpUrl(body.url);
    } catch {
      return NextResponse.json({ error: "That URL is not allowed" }, { status: 400 });
    }

    if (body.kind === "video") {
      if (youtubeId(target.toString()) || vimeoId(target.toString())) {
        return NextResponse.json(
          { error: "YouTube and Vimeo cannot be downloaded as files. Copy the URL instead." },
          { status: 400 }
        );
      }
      if (isHls(target.toString())) {
        return NextResponse.json(
          { error: "HLS streams cannot be downloaded as a single file. Copy the URL instead." },
          { status: 400 }
        );
      }
    }

    const upstream = await fetch(target.toString(), {
      headers: { "user-agent": "PlayBoundAdmin/1.0", accept: "*/*" },
      redirect: "follow",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Could not fetch media (${upstream.status})` },
        { status: 400 }
      );
    }

    const declared = Number(upstream.headers.get("content-length") || 0);
    const cap = body.kind === "image" ? IMAGE_MAX_BYTES : VIDEO_MAX_BYTES;
    if (declared > cap) {
      return NextResponse.json({ error: "That file is too large to download here" }, { status: 400 });
    }

    if (body.kind === "image") {
      const buf = Buffer.from(await upstream.arrayBuffer());
      if (buf.length > IMAGE_MAX_BYTES) {
        return NextResponse.json({ error: "That file is too large to download here" }, { status: 400 });
      }
      const compressed = await compressImageBuffer(buf);
      const name = safeFilename(body.filename || "image.webp", "image.webp");
      const filename = name.endsWith(".webp") ? name : `${name}.webp`;
      return new NextResponse(new Uint8Array(compressed.buffer), {
        headers: {
          "Content-Type": compressed.contentType,
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const type = upstream.headers.get("content-type") || "video/mp4";
    const ext = /\.webm/i.test(target.pathname) || type.includes("webm") ? "webm" : "mp4";
    const base = safeFilename(body.filename || `video.${ext}`, `video.${ext}`);
    const filename = /\.(mp4|webm)$/i.test(base) ? base : `${base}.${ext}`;
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": type,
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid payload" }, { status: 400 });
    }
    console.error("Newsletter media download failed:", err);
    return NextResponse.json({ error: "Could not download that file" }, { status: 500 });
  }
}
