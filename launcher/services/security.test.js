/*
 * security.js — trust boundary tests.
 *
 * The download allowlist was restructured from a wall of endsWith chains into
 * two tables. Restructuring a security control is only safe if it provably
 * decides the same way, so referenceHostAllowed() below is the original logic
 * copied verbatim, and the first section compares the two host-for-host across
 * a generated corpus that includes the lookalike shapes an allowlist exists to
 * reject.
 *
 * If a domain is ever added to security.js, add it to DOMAINS here too — the
 * oracle is only as good as the corpus it is asked about.
 *
 * Run with: npm run test:security
 */
const { createSecurity, exactOrSubdomain } = require("./security");

const API_BASE = "https://playbound.club";

/* ── the original implementation, kept as an oracle ──────────────────── */

const ALLOWED_API_BASE_HOSTS = new Set([
  "playbound.club",
  "www.playbound.club",
  "localhost",
  "127.0.0.1",
]);

function makeReference({ packaged }) {
  const dynamicAllowedDownloadHosts = new Set();
  const isTrustedPreviewHost = (host) => {
    if (packaged) return false;
    return host.endsWith(".vercel.app") && host.includes("playbound");
  };
  function referenceHostAllowed(hostname) {
    const host = String(hostname || "").toLowerCase();
    if (!host) return false;
    if (dynamicAllowedDownloadHosts.has(host)) return true;
    if (host === "github.com" || host === "www.github.com") return true;
    if (host.endsWith(".githubusercontent.com")) return true;
    if (host === "cdn.openttd.org" || host.endsWith(".openttd.org")) return true;
    if (host.endsWith(".adoptium.net") || host === "api.adoptium.net") return true;
    if (host === "contentdb.luanti.org" || host.endsWith(".luanti.org")) return true;
    if (host === "content.minetest.net" || host.endsWith(".minetest.net")) return true;
    if (host.endsWith(".github.com") && host.includes("objects")) return true;
    if (host.endsWith(".public.blob.vercel-storage.com")) return true;
    if (host.endsWith(".vercel-storage.com")) return true;
    if (host === "files.freeciv.org" || host.endsWith(".freeciv.org")) return true;
    if (host === "sourceforge.net" || host.endsWith(".sourceforge.net")) return true;
    if (host === "dl.xonotic.org" || host.endsWith(".xonotic.org")) return true;
    if (host === "releases.wildfiregames.com" || host.endsWith(".wildfiregames.com")) return true;
    if (host === "gitlab.com" || host.endsWith(".gitlab.com") || host.endsWith(".gitlab-static.net")) {
      return true;
    }
    if (host === "zero-k.info" || host.endsWith(".zero-k.info")) return true;
    if (host === "hedgewars.org" || host.endsWith(".hedgewars.org")) return true;
    if (host === "openarena.ws" || host.endsWith(".openarena.ws")) return true;
    if (host === "megaphilx.com" || host.endsWith(".megaphilx.com")) return true;
    if (host === "villagersandheroes.com" || host.endsWith(".villagersandheroes.com")) return true;
    if (host === "download.flightgear.org" || host.endsWith(".flightgear.org")) return true;
    if (host === "eqmaps.info" || host.endsWith(".eqmaps.info")) return true;
    if (host === "albiononline.com" || host.endsWith(".albiononline.com")) return true;
    if (host === "guildwars2.com" || host.endsWith(".guildwars2.com")) return true;
    if (host === "arena.net" || host.endsWith(".arena.net")) return true;
    if (host === "lotro.com" || host.endsWith(".lotro.com")) return true;
    if (host === "daybreakgames.com" || host.endsWith(".daybreakgames.com")) return true;
    if (host === "swtor.com" || host.endsWith(".swtor.com")) return true;
    if (host === "runescape.com" || host.endsWith(".runescape.com")) return true;
    if (host === "xsolla.com" || host.endsWith(".xsolla.com")) return true;
    if (host === "itch.io" || host.endsWith(".itch.io") || host.endsWith(".itch.zone")) return true;
    if (host === "archive.org" || host.endsWith(".archive.org")) return true;
    if (host === "codeberg.org" || host.endsWith(".codeberg.org")) return true;
    if (host === "myabandonware.com" || host.endsWith(".myabandonware.com")) return true;
    if (host === "allegro.cc" || host.endsWith(".allegro.cc")) return true;
    if (host === "bzflag.org" || host.endsWith(".bzflag.org")) return true;
    if (host === "scummvm.org" || host.endsWith(".scummvm.org")) return true;
    if (/^itchio-mirror[a-z0-9-]*\.(hwcdn\.net|b-cdn\.net)$/.test(host)) return true;
    if (host.endsWith(".r2.cloudflarestorage.com")) return true;
    if (host.endsWith(".hwcdn.net") || host.endsWith(".ssl.hwcdn.net")) return true;
    if (host.endsWith(".s3.amazonaws.com") || host.endsWith(".cloudfront.net")) return true;
    if (host.endsWith(".fastly.net") || host.endsWith(".akamaihd.net") || host.endsWith(".azureedge.net") || host.endsWith(".dl.dropboxusercontent.com")) return true;
    try {
      const apiHost = new URL(API_BASE).hostname.toLowerCase();
      if (host === apiHost) return true;
    } catch {
      /* ignore */
    }
    if (ALLOWED_API_BASE_HOSTS.has(host)) return true;
    if (isTrustedPreviewHost(host)) return true;
    return false;
  }
  return referenceHostAllowed;
}

/* ── corpus ──────────────────────────────────────────────────────────── */

const DOMAINS = [
  "github.com", "githubusercontent.com", "openttd.org", "adoptium.net", "luanti.org",
  "minetest.net", "vercel-storage.com", "freeciv.org", "sourceforge.net", "xonotic.org",
  "wildfiregames.com", "gitlab.com", "gitlab-static.net", "zero-k.info", "hedgewars.org",
  "openarena.ws", "megaphilx.com", "villagersandheroes.com", "flightgear.org", "eqmaps.info",
  "albiononline.com", "guildwars2.com", "arena.net", "lotro.com", "daybreakgames.com",
  "swtor.com", "runescape.com", "xsolla.com", "itch.io", "itch.zone", "archive.org",
  "codeberg.org", "myabandonware.com", "allegro.cc", "bzflag.org", "scummvm.org",
  "r2.cloudflarestorage.com", "hwcdn.net", "s3.amazonaws.com", "cloudfront.net",
  "fastly.net", "akamaihd.net", "azureedge.net", "dl.dropboxusercontent.com", "playbound.club", "localhost",
  "evil.example", "sourceforgeznet.com",
];

const corpus = new Set();
for (const d of DOMAINS) {
  corpus.add(d);
  corpus.add("www." + d);
  corpus.add("cdn." + d);
  corpus.add("a.b.c." + d);
  // The shapes an allowlist exists to reject.
  corpus.add(d + ".attacker.example");
  corpus.add(d + "-attacker.example");
  corpus.add("attacker" + d);
  corpus.add("attacker-" + d);
  corpus.add(d.replace(/\./g, "-") + ".example");
}
for (const extra of [
  "", "objects.github.com", "objects-origin.github.com", "notobjects.github.com",
  "cdn.public.blob.vercel-storage.com", "itchio-mirror.hwcdn.net", "itchio-mirror-7.b-cdn.net",
  "itchio-mirror.attacker.example", "sourceforge.net.attacker.example",
  "playbound-preview.vercel.app", "playbound-attacker.vercel.app", "someoneelse.vercel.app",
  "127.0.0.1", "api.adoptium.net", "ssl.hwcdn.net", "dl.xonotic.org", "contentdb.luanti.org",
]) {
  corpus.add(extra);
}

/* ── run ─────────────────────────────────────────────────────────────── */

const results = [];
const check = (name, cond, extra = "") => results.push({ name, ok: Boolean(cond), extra });

for (const packaged of [true, false]) {
  const reference = makeReference({ packaged });
  const sec = createSecurity({ isPackaged: () => packaged, getApiBase: () => API_BASE });
  const mismatches = [];
  for (const host of corpus) {
    if (sec.hostAllowedForDownload(host) !== reference(host)) mismatches.push(host);
  }
  check(
    `download allowlist matches the original for all ${corpus.size} hosts (packaged=${packaged})`,
    mismatches.length === 0,
    mismatches.slice(0, 5).join(", ")
  );
}

// The bypasses that were fixed must stay fixed.
{
  const sec = createSecurity({ isPackaged: () => true, getApiBase: () => API_BASE });
  check("rejects sourceforge.net.attacker.example", !sec.hostAllowedForDownload("sourceforge.net.attacker.example"));
  check("rejects itchio-mirror.attacker.example", !sec.hostAllowedForDownload("itchio-mirror.attacker.example"));
  check("rejects a brand-alike vercel preview in a packaged build", !sec.hostAllowedForDownload("playbound-attacker.vercel.app"));
  check("rejects a brand-alike vercel preview as API base in a packaged build", !sec.isAllowedApiBase("https://playbound-attacker.vercel.app"));
  check("still accepts sourceforge mirrors", sec.hostAllowedForDownload("downloads.sourceforge.net"));
  check("still accepts itch mirrors", sec.hostAllowedForDownload("itchio-mirror-7.b-cdn.net"));
}

// Previews remain usable while developing.
{
  const dev = createSecurity({ isPackaged: () => false, getApiBase: () => API_BASE });
  check("dev build accepts a playbound preview origin", dev.isAllowedApiBase("https://playbound-preview.vercel.app"));
  check("dev build still rejects an unrelated preview", !dev.isAllowedApiBase("https://someoneelse.vercel.app"));
}

// API base: scheme rules.
{
  const sec = createSecurity({ isPackaged: () => true, getApiBase: () => API_BASE });
  check("accepts https playbound.club", sec.isAllowedApiBase("https://playbound.club"));
  check("accepts a trailing slash", sec.isAllowedApiBase("https://playbound.club/"));
  check("rejects http playbound.club", !sec.isAllowedApiBase("http://playbound.club"));
  check("accepts http loopback", sec.isAllowedApiBase("http://localhost"));
  check("rejects garbage", !sec.isAllowedApiBase("not a url"));
  check("rejects empty", !sec.isAllowedApiBase(""));
}

// Download URLs must be https, and must throw rather than return falsy.
{
  const sec = createSecurity({ isPackaged: () => true, getApiBase: () => API_BASE });
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check("accepts an allowed https download", sec.assertDownloadUrl("https://github.com/a/b.zip").startsWith("https://github.com/"));
  check("rejects http on a non-loopback host", throws(() => sec.assertDownloadUrl("http://github.com/a/b.zip")));
  check("rejects a disallowed host", throws(() => sec.assertDownloadUrl("https://attacker.example/a.exe")));
  check("rejects a malformed URL", throws(() => sec.assertDownloadUrl("://nope")));
}

// External URLs: only the four schemes.
{
  const sec = createSecurity({ isPackaged: () => true, getApiBase: () => API_BASE });
  const throws = (fn) => {
    try {
      fn();
      return false;
    } catch {
      return true;
    }
  };
  check("allows https", Boolean(sec.assertOpenExternalUrl("https://example.com")));
  check("allows mailto", Boolean(sec.assertOpenExternalUrl("mailto:a@b.com")));
  check("allows steam", Boolean(sec.assertOpenExternalUrl("steam://install/1234")));
  check("allows http loopback", Boolean(sec.assertOpenExternalUrl("http://localhost:3000")));
  check("blocks file:", throws(() => sec.assertOpenExternalUrl("file:///C:/Windows/System32/calc.exe")));
  check("blocks javascript:", throws(() => sec.assertOpenExternalUrl("javascript:alert(1)")));
  check("blocks http on a remote host", throws(() => sec.assertOpenExternalUrl("http://example.com")));
}

// Catalog payloads register their own hosts.
{
  const sec = createSecurity({ isPackaged: () => true, getApiBase: () => API_BASE });
  check("unknown host starts disallowed", !sec.hostAllowedForDownload("cdn.example-game.org"));
  sec.registerCatalogEntryHosts({
    url: "https://cdn.example-game.org/game.zip",
    addons: [{ url: "https://addons.example-game.org/pack.zip" }],
    installConfig: { main: { url: "https://installer.example-game.org/setup.exe" } },
  });
  check("entry url registered", sec.hostAllowedForDownload("cdn.example-game.org"));
  check("addon url registered", sec.hostAllowedForDownload("addons.example-game.org"));
  check("installConfig url registered", sec.hostAllowedForDownload("installer.example-game.org"));
  check("registering is host-exact, not suffix", !sec.hostAllowedForDownload("evil.cdn.example-game.org"));
  check("malformed entries are ignored", (sec.registerCatalogEntryHosts(null), true));
}

// exactOrSubdomain itself.
{
  check("exactOrSubdomain: apex", exactOrSubdomain("itch.io", "itch.io"));
  check("exactOrSubdomain: subdomain", exactOrSubdomain("a.b.itch.io", "itch.io"));
  check("exactOrSubdomain: lookalike suffix", !exactOrSubdomain("evilitch.io", "itch.io"));
  check("exactOrSubdomain: domain as prefix", !exactOrSubdomain("itch.io.evil.com", "itch.io"));
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "OK  " : "FAIL"}  ${r.name}${r.ok || !r.extra ? "" : `  [${r.extra}]`}`);
}
console.log(failed === 0 ? `\nAll ${results.length} checks passed.` : `\n${failed} of ${results.length} FAILED.`);
process.exit(failed === 0 ? 0 : 1);
