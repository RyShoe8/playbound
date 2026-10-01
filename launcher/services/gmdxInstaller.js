const crypto = require("crypto");
const fs = require("fs");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

const GMDX_DOWNLOAD_PAGE = "https://www.moddb.com/downloads/start/308767";
const GMDX_MD5 = "a5b80ae9c362c2ddd97399f733ce9b3b";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36";

async function resolveGmdxDownload(fetcher = fetch) {
  const referer = "https://www.moddb.com/mods/give-me-deus-ex-augmented-edition/downloads/gmdx-ae-12-lite";
  const getPage = async (url, options) => {
    const response = await fetcher(url, options);
    if (response.ok) return response.text();
    // ModDB challenges Node's fetch fingerprint but accepts the Windows curl
    // shipped with the OS. Keep this fallback restricted to these fixed URLs.
    if (response.status !== 403 || fetcher !== fetch || process.platform !== "win32") {
      throw new Error(`GMDX download page returned HTTP ${response.status}`);
    }
    const { stdout } = await execFileAsync("curl.exe", ["--fail", "--silent", "--show-error", "--max-time", "20", "-A", BROWSER_UA, "-e", referer, url], { maxBuffer: 2 * 1024 * 1024 });
    return stdout;
  };
  const html = await getPage(GMDX_DOWNLOAD_PAGE, {
    headers: { "user-agent": BROWSER_UA, referer }, signal: AbortSignal.timeout(15000),
  });
  const match = html.match(/https:\/\/www\.moddb\.com\/downloads\/mirror\/308767\/\d+\/[a-f0-9]+/i);
  if (!match) throw new Error("ModDB did not provide a GMDX download mirror.");
  let location;
  const mirror = await fetcher(match[0], {
    headers: { "user-agent": BROWSER_UA, referer: GMDX_DOWNLOAD_PAGE }, redirect: "manual", signal: AbortSignal.timeout(15000),
  });
  if (mirror.status === 403 && fetcher === fetch && process.platform === "win32") {
    const { stdout } = await execFileAsync("curl.exe", ["--silent", "--show-error", "--head", "--max-time", "20", "-A", BROWSER_UA, "-e", GMDX_DOWNLOAD_PAGE, match[0]], { maxBuffer: 65536 });
    location = stdout.match(/^location:\s*(\S+)/im)?.[1];
  } else if (mirror.status === 302) {
    location = mirror.headers.get("location");
  }
  if (!location || !/^https:\/\/[a-z0-9-]+\.dl\.dbolical\.com\//i.test(location)) {
    throw new Error("ModDB did not provide a trusted GMDX file URL.");
  }
  return location;
}

async function verifyGmdxInstaller(filePath) {
  const hash = crypto.createHash("md5");
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk);
  if (hash.digest("hex") !== GMDX_MD5) throw new Error("GMDX installer checksum does not match the author's published file.");
}

module.exports = { GMDX_DOWNLOAD_PAGE, GMDX_MD5, BROWSER_UA, resolveGmdxDownload, verifyGmdxInstaller };
