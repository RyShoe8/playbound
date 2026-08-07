import sharp from "sharp";

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
