import sharp from "sharp";

export const IMAGE_MAX_EDGE = 2560;
export const WEBP_QUALITY = 82;

export type CompressedImage = {
  buffer: Buffer;
  contentType: "image/webp";
  extension: "webp";
};

/**
 * Normalize owned images to WebP: EXIF-orient, fit inside 2560×2560 (no upscale),
 * quality ~82. Strips most metadata via the encode pipeline.
 */
export async function compressImageBuffer(input: Buffer): Promise<CompressedImage> {
  try {
    const buffer = await sharp(input, { failOn: "none" })
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
      buffer,
      contentType: "image/webp",
      extension: "webp",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not decode image";
    throw new Error(`Image compression failed: ${message}`);
  }
}
