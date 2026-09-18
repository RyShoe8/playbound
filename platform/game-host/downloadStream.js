import http from "node:http";
import https from "node:https";

/**
 * Streams a GET over node:https or node:http, following redirects manually.
 *
 * fetch()'s res.body is a WHATWG ReadableStream, and Readable.fromWeb() —
 * the standard way to pipe it into a Node write stream — has a serious
 * performance bug on Node 20: converting a large fetch body this way pegs a
 * CPU core in pure userspace (confirmed with strace -c: ~0 syscall time
 * while the process sits at 100%+ CPU) and collapses effective throughput to
 * tens of KB/s regardless of real link speed. A 2GB archive that curl pulled
 * at 20+ MB/s took over an hour and still timed out through fetch(). Talking
 * to https directly hands back a real Node Readable with no adapter in the
 * way, so backpressure and the write stream work the way they're supposed to.
 */
export function httpsGetStream(targetUrl, { headers, signal, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const isSourceForge = /sourceforge\.net/i.test(String(targetUrl));
    const defaultHeaders = {
      "User-Agent": isSourceForge
        ? "curl/8.4.0"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      ...headers,
    };
    const attempt = (u, redirectsLeft) => {
      const parsed = typeof u === "string" ? new URL(u) : u;
      const client = parsed.protocol === "http:" ? http : https;
      const req = client.get(parsed, { headers: defaultHeaders, signal }, (res) => {
        req.setTimeout(0);
        res.setTimeout(60_000, () => {
          res.destroy(new Error("Download stream stalled (60s without data)"));
        });
        // Socket inactivity timeouts reset on incoming data automatically.
        // A data listener here would consume bytes before the file pipeline attaches.
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects"));
            return;
          }
          attempt(new URL(res.headers.location, u), redirectsLeft - 1);
          return;
        }
        resolve({ statusCode: status, headers: res.headers, stream: res });
      });
      req.setTimeout(45_000, () => {
        req.destroy(new Error("Connection timed out waiting for server response"));
      });
      req.on("error", reject);
    };
    attempt(targetUrl, maxRedirects);
  });
}
