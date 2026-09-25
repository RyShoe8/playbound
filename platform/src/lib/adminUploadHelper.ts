import { upload } from "@vercel/blob/client";

export interface UploadAdminMediaOptions {
  slug: string;
  kind?: string;
  prefix?: "games" | "mods" | "editions" | "gear" | "uploads";
}

/**
 * Upload an admin media file directly to Vercel Blob from the client.
 * Falls back to server endpoint /api/admin/games/upload if direct client token fails.
 * Bypasses Vercel Serverless Function 4.5MB request size limit for large files (e.g. 5MB+ screenshots).
 */
/*
 * Same limits as the server's compressImageBuffer (src/lib/compressImage.ts).
 * Kept as literals because that module is server-only (it loads sharp).
 */
const IMAGE_MAX_EDGE = 2560;
const WEBP_QUALITY = 0.82;
// Animated and vector formats would lose what makes them what they are.
const SKIP_COMPRESSION = new Set(["image/gif", "image/svg+xml"]);

/**
 * Re-encode an image as WebP, at most IMAGE_MAX_EDGE on its long side, before
 * it leaves the browser.
 *
 * The direct browser → Blob path below skips the server, which is where
 * compression used to happen, so every admin upload landed as the original:
 * 1 MB PNG screenshots and BMP covers that the launcher then downloaded in
 * full for a 200px card. Returns the original file if the browser cannot
 * decode it, or if WebP would come out larger.
 */
async function compressImageInBrowser(file: File): Promise<File> {
  if (!file.type.startsWith("image/") || SKIP_COMPRESSION.has(file.type)) return file;
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", WEBP_QUALITY)
    );
    if (!blob || blob.type !== "image/webp") return file;
    if (blob.size >= file.size && scale === 1) return file;
    const base = file.name.replace(/\.[^.]+$/, "") || "image";
    return new File([blob], `${base}.webp`, { type: "image/webp" });
  } catch {
    return file;
  }
}

export async function uploadAdminMediaFile(
  original: File,
  opts: UploadAdminMediaOptions
): Promise<string> {
  const file = await compressImageInBrowser(original);
  const slug = (opts.slug || "upload").replace(/[^a-z0-9-]/gi, "-").slice(0, 80) || "upload";
  const kind = (opts.kind || "shot").replace(/[^a-z0-9-]/gi, "-").slice(0, 30) || "shot";
  const prefix = opts.prefix || "games";
  const ext =
    file.name.split(".").pop()?.toLowerCase() ||
    (file.type.startsWith("video/") ? "mp4" : "webp");
  const pathname = `${prefix}/${slug}/${kind}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 7)}.${ext}`;

  // 1. Try direct browser → Blob upload via client token endpoint
  try {
    const blob = await upload(pathname, file, {
      access: "public",
      handleUploadUrl: "/api/admin/games/upload/client",
    });
    if (blob?.url) {
      return blob.url;
    }
  } catch (clientErr) {
    console.warn("Direct blob client upload failed, attempting server route fallback:", clientErr);
  }

  // 2. Fallback to server route /api/admin/games/upload
  const body = new FormData();
  body.set("file", file);
  body.set("slug", slug);
  body.set("kind", kind);

  const res = await fetch("/api/admin/games/upload", { method: "POST", body });
  const raw = await res.text().catch(() => "");
  let data: { url?: string; error?: string } | null = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    if (res.status === 413) {
      throw new Error(
        `File is too large (${(file.size / (1024 * 1024)).toFixed(1)}MB). Please upload a file under 30MB.`
      );
    }
    throw new Error(
      data?.error ??
        (raw
          ? `${res.status} ${res.statusText}: ${raw.slice(0, 200)}`
          : `${res.status} ${res.statusText}`)
    );
  }

  if (!data?.url || typeof data.url !== "string") {
    throw new Error("Upload succeeded but no image URL was returned.");
  }

  return data.url;
}
