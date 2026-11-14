# Game archive migration to Ceph S3

## Target download path

Keep PlayBound's existing mirror scoring and R2 promotion policy. For a verified
artifact, prefer R2 when cached, then the Ceph S3 archive. A verified VPS copy
is a migration fallback only. Dedicated server installations and saves stay on
the VPS; they are separate from downloadable game packages.

Ceph RGW endpoint: `https://s3.rogly.net` (the Kubernetes `.svc` endpoint is
cluster-internal). Bucket: `playbound`; region: `us-east-1`; path-style S3 URLs.
The bucket should remain private. Site-side signing uses:

```
S3_ARCHIVE_ENDPOINT=https://s3.rogly.net
S3_ARCHIVE_BUCKET=playbound
S3_ARCHIVE_REGION=us-east-1
S3_ARCHIVE_ACCESS_KEY_ID=<set in deployment secrets>
S3_ARCHIVE_SECRET_ACCESS_KEY=<set in deployment secrets>
```

Set these as Vercel Production environment variables. A local migration run can
pull them into the ignored `platform/.env.local` through the Vercel CLI; no
second permanent credential store is required. Use a key scoped to this bucket.
Never put either credential in the repo, a client bundle, a URL, or a support
message.

## Archive inventory (2026-11-13)

The VPS currently holds about 29 GB under `archive/games/` and 40 GB under
`archive/launcher-packages/`. These are the primary transfer candidates.
`archive/artifacts/` is about 3 GB and includes historical launcher builds;
classify each object before moving it. Keep the signed launcher and its update
metadata on the existing release path. Dedicated server installations live
outside this download archive and must not be removed by this migration.

## Cutover gates

1. Test authenticated `HeadObject`, a small `PutObject`, `GetObject`, range GET,
   and delete of that test object through the public HTTPS gateway. Verify that
   presigned URLs survive the Cloudflare/Ceph proxy without host rewrites.
2. Inventory the VPS archive, including catalog URLs that point directly to
   `mirror.playbound.club`, uploaded packages, mods, and any launcher files.
   Keep the signed launcher on its existing delivery path.
3. Copy each game object under the same relative key. Compare full source and
   destination SHA-256 and byte length. Record S3 verified status only for the
   exact matching object. Resume safely by key after interruptions. The VPS
   can run `game-host/migrateArchiveS3.mjs <relative-key>` with its existing
   `GAME_HOST_SECRET`. The site issues short-lived multipart URLs, so the VPS
   never stores S3 credentials. The script hashes both the VPS source and the
   complete S3 download and refuses to overwrite a different existing object.
   It does not delete the source. Where an Artifact row exists, it marks only
   that exact verified row. The separate `scripts/verify-s3-archive.ts` can
   independently recheck an Artifact with a trusted checksum; it refuses
   missing trusted checksums and never edits catalog game data.
4. Redirect `mirror.playbound.club` at the edge to a PlayBound-controlled
   download gateway. Existing launcher recipes and old installed launchers use
   that hostname. A simple 302 to `s3.rogly.net` is insufficient for old
   launchers because their download allowlist rejects that host. The gateway
   must stream or proxy the signed object on the trusted PlayBound hostname,
   including range requests, without routing game bytes through Vercel or the
   game-server VPS. Validate a large game download and resume before switching
   DNS or edge routing.
5. Confirm R2 cache misses fetch from S3, popular objects still promote to R2,
   and cache evictions leave the S3 copy intact. Verify manual downloads and
   telemetry report the correct source.
6. Move new game-package uploads to S3 with a browser-to-storage multipart
   upload or a dedicated transfer worker. Do not use a Vercel function to proxy
   multi-GB bodies. Only publish an install recipe after object verification.
7. After a soak period, remove only the VPS archive objects whose S3 copy is
   verified and whose old mirror URL works through the new gateway. Do not
   remove game-server installations, saves, or retained rollback copies.

## Current implementation and cutover

`/admin/download-mirrors` now sends **Archive to S3** jobs through the game-host
agent. The agent streams a bounded multipart upload and verifies the complete
source and destination SHA-256; it leaves no new permanent VPS game file. The
one-time `game-host/migrateGameArchiveS3.sh` walks only `archive/games/` and
`archive/launcher-packages/`. It resumes by verifying matching existing objects,
logs failures, and never deletes source files.

`platform/workers/game-mirror` is the edge gateway for the existing
`mirror.playbound.club` URLs. It streams signed private Ceph objects and Range
responses without sending game bytes through Vercel or the game-host VPS. The
site's `/api/internal/archive-sign` requires `MIRROR_GATEWAY_SECRET`; set that
same secret in the Cloudflare Worker and Vercel Production, then redeploy the
site. The Worker must be bound to `mirror.playbound.club/*` **only after** every
currently referenced game package is verified in S3 and test downloads pass.
Deploying the Worker without its route is safe for a preview, but the Worker
rejects requests on non-mirror hostnames. Test with a preview route on a
Cloudflare-owned subdomain or a staging hostname first.

The edge route went live on 2026-11-14, after all 191 packages were copied and
SHA-256 verified and the catalog audit (`/api/internal/archive-audit`) reported
every referenced package present. Browser package uploads now always stream
from temporary Vercel Blob staging into S3, mark only the exact verified
artifact, publish the same stable mirror URL, and remove staging after
verification. There is no switch: the earlier `MIRROR_S3_GATEWAY_ACTIVE` flag
was removed once the route was live. Mixtape uploads no longer touch the VPS
or the mirror; they go from Blob staging straight to R2.

The repository's S3 read path is disabled until its environment variables are
set and an artifact is marked `s3ArchiveStatus: verified`. The current VPS
archive and R2 remain available during migration.
