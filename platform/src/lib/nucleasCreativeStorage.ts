import { CopyObjectCommand, DeleteObjectCommand, GetBucketCorsCommand, GetBucketLifecycleConfigurationCommand, GetObjectCommand, HeadBucketCommand, PutBucketCorsCommand, PutBucketLifecycleConfigurationCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { s3ArchiveClient, s3ArchiveConfig } from './mirrors/s3Archive';

export const CREATIVE_PREFIX = 'nucleas/creative/';
export const CREATIVE_LIMIT = 64 * 1024 * 1024;
let setupUntil = 0;
export function creativeScope(input: Record<string, unknown>) {
  const { organizationId: org, companyId: company, assetId: asset } = input;
  if (![org, company, asset].every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id))) throw Error('Invalid creative scope');
  return { staging: `${CREATIVE_PREFIX}staging/${org}/${company}/${asset}.rigby`, source: `${CREATIVE_PREFIX}organizations/${org}/companies/${company}/animations/${asset}/project.rigby` };
}
const missingConfig = (error: unknown) => (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
/** Merge only our CORS/lifecycle rule. Existing game/cache rules remain intact. */
async function ensureBrowserAccess(s3: S3Client, bucket: string) {
  if (Date.now() < setupUntil) return;
  const cors = await s3.send(new GetBucketCorsCommand({ Bucket: bucket })).catch(error => { if (!missingConfig(error)) throw error; return { CORSRules: [] }; });
  const origins = ['https://os.nucleas.app', 'https://nucleas.app', 'https://www.nucleas.app'];
  const ownCors = { ID: 'nucleas-creative-studio', AllowedOrigins: origins, AllowedMethods: ['GET', 'HEAD', 'PUT'], AllowedHeaders: ['content-type', 'content-length', 'x-amz-*'], ExposeHeaders: ['ETag'], MaxAgeSeconds: 600 };
  if (!cors.CORSRules?.some(rule => rule.ID === ownCors.ID && JSON.stringify(rule) === JSON.stringify(ownCors))) {
    await s3.send(new PutBucketCorsCommand({ Bucket: bucket, CORSConfiguration: { CORSRules: [...(cors.CORSRules ?? []).filter(rule => rule.ID !== ownCors.ID), ownCors] } }));
  }
  const lifecycle = await s3.send(new GetBucketLifecycleConfigurationCommand({ Bucket: bucket })).catch(error => { if (!missingConfig(error)) throw error; return { Rules: [] }; });
  const ownLifecycle = { ID: 'nucleas-creative-staging-expiry', Status: 'Enabled' as const, Filter: { Prefix: `${CREATIVE_PREFIX}staging/` }, Expiration: { Days: 1 } };
  if (!lifecycle.Rules?.some(rule => rule.ID === ownLifecycle.ID && JSON.stringify(rule) === JSON.stringify(ownLifecycle))) {
    await s3.send(new PutBucketLifecycleConfigurationCommand({ Bucket: bucket, LifecycleConfiguration: { Rules: [...(lifecycle.Rules ?? []).filter(rule => rule.ID !== ownLifecycle.ID), ownLifecycle] } }));
  }
  setupUntil = Date.now() + 30 * 60000;
}
/** Caller must authenticate the existing Nucleas HMAC before invoking this bounded storage API. */
export async function nucleasCreativeAction(input: Record<string, unknown>) {
  const config = s3ArchiveConfig();
  if (!config || config.endpoint !== 'https://s3.rogly.net' || config.bucket !== 'playbound') throw Error('Game storage is unavailable');
  const s3 = s3ArchiveClient(config);
  try {
    if (input.action === 'status') {
      await s3.send(new HeadBucketCommand({ Bucket: config.bucket }));
      return { configured: true, prefix: CREATIVE_PREFIX };
    }
    const keys = creativeScope(input), base = { Bucket: config.bucket };
    if (input.action === 'upload') {
      if (!Number.isInteger(input.size) || Number(input.size) < 22 || Number(input.size) > CREATIVE_LIMIT) throw Error('Invalid creative upload size');
      await ensureBrowserAccess(s3, config.bucket);
      const url = await getSignedUrl(s3, new PutObjectCommand({ ...base, Key: keys.staging, ContentType: 'application/octet-stream', ContentLength: Number(input.size) }), { expiresIn: 600, signableHeaders: new Set(['content-length', 'content-type']) });
      return { url };
    }
    if (input.action === 'download') {
      const url = await getSignedUrl(s3, new GetObjectCommand({ ...base, Key: input.staging === true ? keys.staging : keys.source, ResponseContentDisposition: 'attachment; filename="animation.rigby"' }), { expiresIn: 300 });
      return { url };
    }
    if (input.action === 'promote') {
      if (typeof input.etag !== 'string' || !/^"?[a-f0-9]{32}(?:-\d+)?"?$/i.test(input.etag)) throw Error('Invalid verified object ETag');
      await s3.send(new CopyObjectCommand({ ...base, Key: keys.source, CopySource: `${config.bucket}/${keys.staging}`, CopySourceIfMatch: input.etag, ACL: 'private' }));
      return { completed: true };
    }
    if (input.action === 'remove-staging') {
      await s3.send(new DeleteObjectCommand({ ...base, Key: keys.staging }));
      return { completed: true };
    }
    throw Error('Unknown creative storage operation');
  } finally { s3.destroy(); }
}
