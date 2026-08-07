import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { compressImageBuffer } from "@/lib/compressImage";
import { requireAdminSession } from "@/lib/requireAdmin";

export async function POST(req: Request) {
  try {
    const { error } = await requireAdminSession();
    if (error) return error;

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: "BLOB_READ_WRITE_TOKEN is not configured on this environment" },
        { status: 503 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    const slug = String(form.get("slug") || "upload").replace(/[^a-z0-9-]/gi, "-").slice(0, 80);
    const kind = String(form.get("kind") || "shot");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Max file size is 8MB" }, { status: 400 });
    }
    const name = file.name.toLowerCase();
    const looksLikeImage =
      file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name);
    if (!looksLikeImage) {
      return NextResponse.json({ error: "Only image uploads are allowed" }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());
    let compressed;
    try {
      compressed = await compressImageBuffer(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid image";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    const pathname = `games/${slug || "upload"}/${kind}-${Date.now()}.${compressed.extension}`;
    const blob = await put(pathname, compressed.buffer, {
      access: "public",
      contentType: compressed.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
