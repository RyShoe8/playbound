import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";

/** Durable game-file origin. R2 remains the separately configured hot cache. */
export function s3ArchiveConfig() {
  const endpoint = process.env.S3_ARCHIVE_ENDPOINT || "";
  const bucket = process.env.S3_ARCHIVE_BUCKET || "";
  const accessKeyId = process.env.S3_ARCHIVE_ACCESS_KEY_ID || "";
  const secretAccessKey = process.env.S3_ARCHIVE_SECRET_ACCESS_KEY || "";
  const region = process.env.S3_ARCHIVE_REGION || "us-east-1";
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  const url = new URL(endpoint);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("S3 archive endpoint must be an HTTPS origin without a path or credentials");
  }
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error("Invalid S3 archive bucket");
  return { endpoint: url.origin, bucket, accessKeyId, secretAccessKey, region };
}

export function s3ArchiveConfigured(): boolean {
  return Boolean(s3ArchiveConfig());
}

export function safeS3ArchiveKey(key: string): string {
  const parts = key.split("/");
  if (!key || key.startsWith("/") || parts.some((part) => !part || part === "." || part === "..") || /[\\\u0000-\u001f]/.test(key)) {
    throw new Error("Invalid S3 archive object key");
  }
  return key;
}

export function s3ArchiveClient(config: NonNullable<ReturnType<typeof s3ArchiveConfig>>): S3Client {
  // Ceph RGW uses path-style bucket URLs behind this gateway.
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: true,
    requestChecksumCalculation: "WHEN_REQUIRED",
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

/** A 404 means absent. Auth, connectivity, and gateway errors must stay errors. */
export async function headS3ArchiveObject(key: string): Promise<{ exists: boolean; sizeBytes?: number; etag?: string }> {
  const config = s3ArchiveConfig();
  if (!config) throw new Error("S3 archive is not configured");
  const s3 = s3ArchiveClient(config);
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: safeS3ArchiveKey(key) }));
        return { exists: true, sizeBytes: result.ContentLength, etag: result.ETag };
      } catch (error) {
        const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
        if (status === 404) return { exists: false };
        // Ceph's public gateway has occasionally answered one HEAD with 403
        // while the next identical signed request succeeds. Never treat 403
        // as absence: a persistent auth failure must still stop the transfer.
        if (status !== 403 || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
    throw new Error("S3 object check failed");
  } finally {
    s3.destroy();
  }
}

export async function signedS3ArchiveDownloadUrl(key: string, filename: string, expiresIn = 3600): Promise<string> {
  const config = s3ArchiveConfig();
  if (!config) throw new Error("S3 archive is not configured");
  if (!Number.isInteger(expiresIn) || expiresIn < 1 || expiresIn > 3600) throw new Error("Invalid S3 archive URL lifetime");
  const safeName = filename.replace(/["\\\r\n\u0000-\u001f]/g, "").trim();
  if (!safeName) throw new Error("Missing download filename");
  const s3 = s3ArchiveClient(config);
  try {
    return await getSignedUrl(s3, new GetObjectCommand({
      Bucket: config.bucket,
      Key: safeS3ArchiveKey(key),
      ResponseContentDisposition: `attachment; filename="${safeName}"`,
    }), { expiresIn });
  } finally {
    s3.destroy();
  }
}

/** Read every byte from Ceph before declaring a migrated object verified. */
export async function hashS3ArchiveObject(key: string): Promise<{ sizeBytes: number; sha256: string }> {
  const config = s3ArchiveConfig();
  if (!config) throw new Error("S3 archive is not configured");
  const s3 = s3ArchiveClient(config);
  try {
    const result = await s3.send(new GetObjectCommand({ Bucket: config.bucket, Key: safeS3ArchiveKey(key) }));
    if (!result.Body) throw new Error("S3 archive object has no body");
    const hash = createHash("sha256");
    let sizeBytes = 0;
    for await (const chunk of result.Body as AsyncIterable<Uint8Array>) {
      sizeBytes += chunk.byteLength;
      hash.update(chunk);
    }
    if (result.ContentLength !== undefined && sizeBytes !== result.ContentLength) {
      throw new Error("S3 archive object ended before its declared content length");
    }
    return { sizeBytes, sha256: hash.digest("hex") };
  } finally {
    s3.destroy();
  }
}

/** Exercise the private Ceph gateway without exposing credentials or leaving a test file behind. */
export async function probeS3Archive(): Promise<{ write: true; head: true; signedRangeRead: true; delete: true }> {
  const config = s3ArchiveConfig();
  if (!config) throw new Error("S3 archive is not configured");
  const key = `_playbound-probe/${randomUUID()}.txt`;
  const body = Buffer.from("PlayBound S3 archive probe\n", "utf8");
  const s3 = s3ArchiveClient(config);
  let uploaded = false;
  try {
    await s3.send(new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: "text/plain" }));
    uploaded = true;
    const head = await s3.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
    if (head.ContentLength !== body.length) throw new Error("S3 probe HEAD returned the wrong size");
    const signed = await getSignedUrl(s3, new GetObjectCommand({ Bucket: config.bucket, Key: key }), { expiresIn: 60 });
    const response = await fetch(signed, { headers: { Range: "bytes=0-8" }, signal: AbortSignal.timeout(15000) });
    if (response.status !== 206 || (await response.arrayBuffer()).byteLength !== 9) {
      throw new Error(`S3 probe signed range GET returned ${response.status}`);
    }
    return { write: true, head: true, signedRangeRead: true, delete: true };
  } finally {
    try {
      if (uploaded) await s3.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: key }));
    } finally {
      s3.destroy();
    }
  }
}
