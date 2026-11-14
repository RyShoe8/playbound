/** Cloudflare edge gateway for the private Ceph game archive.
 * Bind to mirror.playbound.club only after all referenced packages are verified in S3.
 * Configure MIRROR_GATEWAY_SECRET as a Worker secret, also set in Vercel Production.
 */
export default {
  async fetch(request, env) {
    const original = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", { status: 405 });
    }
    const preview = original.hostname.endsWith(".workers.dev") &&
      request.headers.get("x-playbound-preview-secret") === env.MIRROR_GATEWAY_SECRET;
    if (!env.MIRROR_GATEWAY_SECRET || (original.hostname !== "mirror.playbound.club" && !preview)) {
      return new Response("Mirror unavailable", { status: 503 });
    }
    let key;
    try {
      key = decodeURIComponent(original.pathname.slice(1));
    } catch {
      return new Response("Invalid path", { status: 400 });
    }
    if ((!key.startsWith("games/") && !key.startsWith("launcher-packages/")) ||
        key.split("/").some((part) => !part || part === "." || part === "..") ||
        key.includes("\\") || key.length > 450) {
      return new Response("Not found", { status: 404 });
    }
    const sign = new URL("https://playbound.club/api/internal/archive-sign");
    sign.searchParams.set("key", key);
    const signed = await fetch(sign, {
      headers: { authorization: `Bearer ${env.MIRROR_GATEWAY_SECRET}` },
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (!signed.ok) {
      return new Response(signed.status === 404 ? "Not found" : "Mirror temporarily unavailable", {
        status: signed.status === 404 ? 404 : 503,
      });
    }
    const { url, sizeBytes } = await signed.json();
    if (typeof url !== "string" || new URL(url).origin !== "https://s3.rogly.net") {
      return new Response("Mirror temporarily unavailable", { status: 503 });
    }
    if (request.method === "HEAD") {
      return new Response(null, { status: 200, headers: {
        "content-length": String(sizeBytes), "accept-ranges": "bytes",
        "cache-control": "public, max-age=60",
      } });
    }
    const range = request.headers.get("range");
    const upstream = await fetch(url, {
      headers: range ? { range } : {},
      cf: { cacheTtl: 0, cacheEverything: false },
    });
    if (upstream.status !== 200 && upstream.status !== 206 && upstream.status !== 416) {
      return new Response("Mirror temporarily unavailable", { status: 503 });
    }
    const headers = new Headers();
    for (const name of ["content-type", "content-length", "content-range", "content-disposition", "accept-ranges", "etag", "last-modified"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    headers.set("cache-control", "public, max-age=60");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
