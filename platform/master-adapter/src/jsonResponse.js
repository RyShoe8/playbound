import { gzipSync } from "node:zlib";

const MIN_GZIP_BYTES = 1024;

/** Compress large server lists before they leave Render. */
export function encodeJsonResponse(payload, acceptEncoding = "") {
  const plain = Buffer.from(JSON.stringify(payload));
  const acceptsGzip = /(?:^|,)\s*gzip(?:\s*;\s*q\s*=\s*(?!0(?:\.0+)?(?:\s*,|\s*$))[^,]*)?(?:\s*,|\s*$)/i.test(acceptEncoding);
  if (!acceptsGzip || plain.length < MIN_GZIP_BYTES) return { body: plain, encoding: null, plainBytes: plain.length };
  const zipped = gzipSync(plain, { level: 6 });
  return zipped.length < plain.length
    ? { body: zipped, encoding: "gzip", plainBytes: plain.length }
    : { body: plain, encoding: null, plainBytes: plain.length };
}

export function sendJson(req, res, status, payload, headers = {}, onBytes = () => {}) {
  const { body, encoding, plainBytes } = encodeJsonResponse(payload, String(req.headers["accept-encoding"] || ""));
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    vary: "Accept-Encoding",
    "content-length": body.length,
    ...headers,
    ...(encoding ? { "content-encoding": encoding } : {}),
  });
  res.end(body);
  onBytes(body.length, plainBytes);
}
