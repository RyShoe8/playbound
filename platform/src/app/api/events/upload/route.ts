import { put } from "@vercel/blob";
import { unstable_rethrow } from "next/navigation";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { userFromLauncherBearer } from "@/lib/library";
import { blobToDetachedBuffer, compressImageBuffer } from "@/lib/compressImage";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    const launcherUser = session?.user?.id ? null : await userFromLauncherBearer(req);
    const userId = session?.user?.id || (launcherUser?._id ? launcherUser._id.toString() : null);

    if (!userId) {
      return NextResponse.json(
        { error: "Sign in required to upload event cover photo" },
        { status: 401 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Max file size is 8MB" }, { status: 400 });
    }
    const name = file.name.toLowerCase();
    const looksLikeImage =
      file.type.startsWith("image/") || /\.(jpe?g|png|gif|webp|avif|bmp)$/i.test(name);
    if (!looksLikeImage) {
      return NextResponse.json({ error: "Only image files are allowed" }, { status: 400 });
    }

    const input = await blobToDetachedBuffer(file);
    let compressed;
    try {
      compressed = await compressImageBuffer(input);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid image";
      return NextResponse.json({ error: message }, { status: 400 });
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      // Local development fallback
      const dataUri = `data:${compressed.contentType};base64,${compressed.buffer.toString("base64")}`;
      return NextResponse.json({ url: dataUri });
    }

    const pathname = `events/cover-${userId}-${Date.now()}.${compressed.extension}`;
    const blob = await put(pathname, compressed.buffer, {
      access: "public",
      contentType: compressed.contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });

    return NextResponse.json({ url: blob.url });
  } catch (err) {
    // Let Next's own control-flow errors through — see unstable_rethrow.
    unstable_rethrow(err);
    console.error("Event cover upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
