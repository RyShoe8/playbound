import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function getR2ClientConfig() {
  const accountId = process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET_NAME || process.env.R2_BUCKET || "playbound-mirror-cache";
  const customDomain = process.env.R2_CUSTOM_DOMAIN || null;

  const isConfigured = Boolean(accountId && accessKeyId && secretAccessKey);

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    customDomain,
    isConfigured,
  };
}

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client | null {
  const config = getR2ClientConfig();
  if (!config.isConfigured) return null;

  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId!,
        secretAccessKey: config.secretAccessKey!,
      },
    });
  }

  return s3ClientInstance;
}

/**
 * Generates a temporary presigned GET URL for a Cloudflare R2 object.
 * Default lifetime: 1 hour (3600 seconds).
 */
export async function getR2PresignedDownloadUrl(
  objectKey: string,
  expiresInSeconds: number = 3600
): Promise<string> {
  const config = getR2ClientConfig();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    // Development / fallback simulation mode
    const base = config.customDomain || "https://r2.playbound.club";
    const cleanKey = objectKey.replace(/^\/+/, "");
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return `${base}/${cleanKey}?token=sim_${expiresAt}`;
  }

  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
  });

  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}

/**
 * Checks if an object exists in Cloudflare R2 and returns its size & metadata.
 */
export async function checkR2ObjectExists(
  objectKey: string
): Promise<{ exists: boolean; sizeBytes?: number; etag?: string }> {
  const config = getR2ClientConfig();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    // In mock mode, pretend objects exist for simulated items
    return { exists: true, sizeBytes: 1024 * 1024 * 50 };
  }

  try {
    const command = new HeadObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    });
    const res = await client.send(command);
    return {
      exists: true,
      sizeBytes: res.ContentLength,
      etag: res.ETag,
    };
  } catch (err: unknown) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    if (status === 404) {
      return { exists: false };
    }
    console.warn(`[R2Client] HeadObject error for ${objectKey}:`, err);
    return { exists: false };
  }
}

/**
 * Uploads a buffer or stream to Cloudflare R2 (Standard storage class).
 */
export async function uploadObjectToR2(
  objectKey: string,
  body: Buffer | Uint8Array | Blob | string,
  contentType: string = "application/octet-stream"
): Promise<{ success: boolean; sizeBytes: number; error?: string }> {
  const config = getR2ClientConfig();
  const client = getS3Client();

  const size = typeof body === "string" ? Buffer.byteLength(body) : (body as Buffer).length || 0;

  if (!client || !config.isConfigured) {
    // Simulated upload in development
    return { success: true, sizeBytes: size };
  }

  try {
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
      StorageClass: "STANDARD",
    });
    await client.send(command);
    return { success: true, sizeBytes: size };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[R2Client] Upload failed for ${objectKey}:`, message);
    return { success: false, sizeBytes: 0, error: message };
  }
}

/**
 * Deletes an object from Cloudflare R2 upon eviction.
 */
export async function deleteObjectFromR2(objectKey: string): Promise<{ success: boolean }> {
  const config = getR2ClientConfig();
  const client = getS3Client();

  if (!client || !config.isConfigured) {
    return { success: true };
  }

  try {
    const command = new DeleteObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
    });
    await client.send(command);
    return { success: true };
  } catch (err) {
    console.error(`[R2Client] Delete failed for ${objectKey}:`, err);
    return { success: false };
  }
}
