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
export async function uploadAdminMediaFile(
  file: File,
  opts: UploadAdminMediaOptions
): Promise<string> {
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
