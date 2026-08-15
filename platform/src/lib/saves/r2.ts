/**
 * Cloudflare R2 access for cloud saves.
 *
 * R2 rather than Vercel Blob because save sync is egress-heavy by nature —
 * every device pulls what every other device pushed — and R2 does not charge
 * for egress. It speaks the S3 API, so this is the standard client pointed at
 * an account-specific endpoint.
 *
 * Save data never passes through our serverless functions. Vercel caps request
 * bodies at a few megabytes and a save archive can be far larger, so the
 * launcher uploads and downloads directly against presigned URLs and the API
 * only ever mints them. That also keeps game saves out of our request logs.
 */
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/** Presigned URLs are short-lived: long enough to upload, short enough to not linger. */
const SIGNED_URL_TTL_SECONDS = 15 * 60;

export function r2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

let client: S3Client | null = null;

function r2(): S3Client {
  if (!r2Configured()) {
    throw new Error("R2 is not configured — set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET.");
  }
  if (client) return client;
  client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return client;
}

function bucket(): string {
  return process.env.R2_BUCKET!;
}

/**
 * Object key for one snapshot.
 *
 * User id comes first so a key can never be reached without knowing whose it
 * is, and so a user's entire save data is one prefix to enumerate or delete.
 * The caller is responsible for having authenticated that user — nothing here
 * infers identity from the request.
 */
export function saveKey(opts: {
  userId: string;
  gameSlug: string;
  editionSlug: string;
  snapshotId: string;
}): string {
  const safe = (s: string) => String(s).replace(/[^a-z0-9_.-]/gi, "_");
  return `saves/${safe(opts.userId)}/${safe(opts.gameSlug)}/${safe(opts.editionSlug)}/${safe(
    opts.snapshotId
  )}.zip`;
}

export function savePrefix(opts: { userId: string; gameSlug: string; editionSlug: string }): string {
  const safe = (s: string) => String(s).replace(/[^a-z0-9_.-]/gi, "_");
  return `saves/${safe(opts.userId)}/${safe(opts.gameSlug)}/${safe(opts.editionSlug)}/`;
}

export interface RemoteSnapshot {
  snapshotId: string;
  key: string;
  bytes: number;
  uploadedAt: string;
}

/** Snapshots stored for one game+edition, newest first. */
export async function listRemoteSnapshots(opts: {
  userId: string;
  gameSlug: string;
  editionSlug: string;
}): Promise<RemoteSnapshot[]> {
  const prefix = savePrefix(opts);
  const res = await r2().send(
    new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, MaxKeys: 100 })
  );
  return (res.Contents ?? [])
    .filter((o) => o.Key && o.Key.endsWith(".zip"))
    .map((o) => ({
      snapshotId: o.Key!.slice(prefix.length).replace(/\.zip$/, ""),
      key: o.Key!,
      bytes: Number(o.Size ?? 0),
      uploadedAt: (o.LastModified ?? new Date()).toISOString(),
    }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function presignUpload(key: string, contentLength: number): Promise<string> {
  return getSignedUrl(
    r2(),
    new PutObjectCommand({
      Bucket: bucket(),
      Key: key,
      ContentType: "application/zip",
      // Signing the length stops a presigned URL being reused to store
      // something far larger than the quota that was checked.
      ContentLength: contentLength,
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS }
  );
}

export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(r2(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}

export async function deleteSnapshot(key: string): Promise<void> {
  await r2().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
}

/** Confirm an upload actually landed, and how big it really was. */
export async function statSnapshot(key: string): Promise<{ bytes: number } | null> {
  try {
    const res = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return { bytes: Number(res.ContentLength ?? 0) };
  } catch {
    return null;
  }
}
