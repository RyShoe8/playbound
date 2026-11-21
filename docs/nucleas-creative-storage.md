# Nucleas creative sources on Rogly

`platform/src/app/api/integrations/nucleas/creative-storage/route.ts` lets Nucleas reuse PlayBound's existing Rogly game archive for private editable animation sources. No additional credentials are introduced. Deploy this endpoint alongside the Nucleas Animation Studio storage changes.

The endpoint verifies the existing Nucleas roundup HMAC, including timestamp, method, path and exact body. PlayBound alone uses its existing `s3ArchiveConfig()` credentials. Nucleas receives short-lived signed URLs rather than S3 keys. The endpoint accepts fixed actions and hexadecimal organization/company/asset IDs, never arbitrary object paths, bucket names or hosts.

All creative files are inside `playbound/nucleas/creative/`:

- `staging/<organization>/<company>/<asset>.rigby`: unfinished uploads, up to 64 MB, ten-minute PUT URLs with signed content length.
- `organizations/<organization>/companies/<company>/animations/<asset>/project.rigby`: accepted immutable source versions, five-minute GET URLs.

Nucleas authorizes the user and company, reads back the upload, checks its hash and archive structure, then requests promotion using that read's ETag. CopySourceIfMatch prevents accepting changed staging bytes. Deletion is restricted to staging. Source promotion is issued only through Nucleas's authenticated upload-completion flow.

On the first upload, PlayBound merges a named CORS rule for the production Nucleas origins and a named one-day lifecycle rule for `nucleas/creative/staging/`. Existing rules are retained. This requires the existing storage access to permit reading and updating those configurations. Game keys, visibility and game metadata are unchanged. The endpoint fails rather than falling back to public storage or arbitrary locations.

Validation: `cd platform` then `npx vitest run src/lib/nucleasCreativeStorage.test.ts`. Tests use synthetic credentials and mock S3, including checks that existing CORS/lifecycle rules survive. They do not access the live archive. Verify one save/open in Nucleas after both deployments to confirm Ceph browser access.
