import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const roundupInput = z.object({
  idempotencyKey: z.string().min(1).max(200).regex(/^[A-Za-z0-9._:-]+$/),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(400),
  bodyMarkdown: z.string().trim().min(1).max(100000),
  coverageStart: z.iso.datetime({ offset: true }),
  coverageEnd: z.iso.datetime({ offset: true }),
  coveredIds: z.array(z.string().regex(/^[a-fA-F0-9]{24}$/)).max(2000),
}).strict().refine(v => Date.parse(v.coverageStart) < Date.parse(v.coverageEnd), "coverageStart must precede coverageEnd");
export type RoundupPublicationInput = z.infer<typeof roundupInput>;

export function verifyRoundupRequest(req: Request, rawBody: string, secret: string, now = Date.now()): boolean {
  const timestamp = req.headers.get("x-nucleas-timestamp") || "";
  const signature = req.headers.get("x-nucleas-signature") || "";
  if (!/^\d{1,12}$/.test(timestamp) || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const url = new URL(req.url);
  const expected = createHmac("sha256", secret).update(`${timestamp}.${req.method}.${url.pathname}${url.search}.${rawBody}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature, "hex"));
}

export function publicationIdentity(input: RoundupPublicationInput) {
  const normalized = { ...input, coverageStart: new Date(input.coverageStart).toISOString(), coverageEnd: new Date(input.coverageEnd).toISOString(), coveredIds: [...new Set(input.coveredIds.map(id => id.toLowerCase()))].sort() };
  const titleSlug = input.title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 100).replace(/^-+|-+$/g, "") || "roundup";
  const keySuffix = createHash("sha256").update(input.idempotencyKey).digest("hex").slice(0, 12);
  return {
    normalized,
    sourceKey: `nucleas:roundup:${input.idempotencyKey}`,
    slug: `${titleSlug}-${normalized.coverageEnd.slice(0, 10)}-${keySuffix}`,
    hash: createHash("sha256").update(JSON.stringify(normalized)).digest("hex"),
  };
}
