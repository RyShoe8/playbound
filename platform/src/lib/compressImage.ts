import type Sharp from "sharp";

/**
 * sharp is loaded on first use, not at module scope.
 *
 * As a top-level import, a failure to load it — a missing native binary for the
 * deployment's platform, most often — throws while the route module is being
 * evaluated. That is before any handler runs, so no try/catch in the route can
 * see it and the response is Next's HTML error page rather than JSON. The
 * symptom is an upload that fails instantly with a wall of markup and no
 * reason, which is exactly what it did.
 *
 * Imported here instead, the same failure lands inside the handler's catch and
 * comes back as a message naming what went wrong.
 */
let sharpModule: typeof Sharp | null = null;

/**
 * Which of sharp's native packages actually made it into the bundle.
 *
 * sharp's own load error names the runtime it tried and the library it could
 * not open, but not whether the package holding that library is on disk at all
 * — and those are different faults with different fixes. A missing directory
 * means the install or the file trace dropped it; a present directory with a
 * failed dlopen means the wrong build for this platform.
 *
 * Best-effort by design: this only ever runs on a path that is already
 * failing, so it must not be able to make things worse.
 */
async function nativePackageReport(): Promise<string> {
  try {
    const { existsSync } = await import("fs");
    const { join } = await import("path");
    const { platform, arch } = process;
    const suffix = `${platform}-${arch}`;
    const expected = [`@img/sharp-${suffix}`, `@img/sharp-libvips-${suffix}`];
    const seen = expected.map((pkg) => {
      const present = existsSync(join(process.cwd(), "node_modules", pkg));
      return `${pkg}: ${present ? "present" : "MISSING"}`;
    });
    return `; runtime ${suffix}; ${seen.join(", ")}`;
  } catch {
    return "";
  }
}

async function loadSharp(): Promise<typeof Sharp> {
  if (sharpModule) return sharpModule;
  try {
    const mod = await import("sharp");
    sharpModule = (mod.default ?? mod) as typeof Sharp;
    return sharpModule;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Image compression is unavailable on this deployment: sharp failed to load (${detail})` +
        (await nativePackageReport())
    );
  }
}

export const IMAGE_MAX_EDGE = 2560;
export const WEBP_QUALITY = 82;

export type CompressedImage = {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
};

/**
 * Copy bytes into a standalone Node Buffer.
 *
 * Newer undici/fetch rejects bodies backed by SharedArrayBuffer. File.arrayBuffer(),
 * Response.arrayBuffer(), and some sharp outputs can surface that and break
 * `@vercel/blob` put() with: "ArrayBuffer: SharedArrayBuffer is not allowed".
 */
export function toDetachedBuffer(input: ArrayBuffer | ArrayBufferView | Buffer): Buffer {
  const view =
    input instanceof ArrayBuffer
      ? new Uint8Array(input)
      : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return Buffer.from(copy);
}

/** Read a Blob/File into a detached Buffer safe for sharp + Blob put(). */
export async function blobToDetachedBuffer(blob: Blob): Promise<Buffer> {
  return toDetachedBuffer(await blob.arrayBuffer());
}

/**
 * Normalize owned images to WebP: EXIF-orient, fit inside 2560×2560 (no upscale),
 * quality ~82. Strips most metadata via the encode pipeline.
 */
export async function compressImageBuffer(input: Buffer): Promise<CompressedImage> {
  try {
    const sharp = await loadSharp();
    const buffer = await sharp(toDetachedBuffer(input), { failOn: "none" })
      .rotate()
      .resize({
        width: IMAGE_MAX_EDGE,
        height: IMAGE_MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer();

    if (!buffer.length) {
      throw new Error("Compressed image is empty");
    }

    return {
      buffer: toDetachedBuffer(buffer),
      contentType: "image/webp",
      extension: "webp",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not decode image";
    throw new Error(`Image compression failed: ${message}`);
  }
}
