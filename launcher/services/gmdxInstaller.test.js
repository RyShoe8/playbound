const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { resolveGmdxDownload, verifyGmdxInstaller } = require("./gmdxInstaller");

test("resolves only the expected ModDB mirror to its signed download host", async () => {
  const fetcher = async (url, options) => {
    if (url.endsWith("/start/308767")) return {
      ok: true, text: async () => '<a href="https://www.moddb.com/downloads/mirror/308767/134/ca980328103cb8d29cec82cb3f695875">Download</a>',
    };
    assert.equal(options.redirect, "manual");
    return { status: 302, headers: new Headers({ location: "https://fmt5.dl.dbolical.com/dl/GMDX.exe?st=token" }) };
  };
  assert.match(await resolveGmdxDownload(fetcher), /^https:\/\/fmt5\.dl\.dbolical\.com\//);
});

test("rejects a mirror redirect to an untrusted host", async () => {
  const fetcher = async (url) => url.endsWith("/start/308767")
    ? { ok: true, text: async () => "https://www.moddb.com/downloads/mirror/308767/134/ca980328103cb8d29cec82cb3f695875" }
    : { status: 302, headers: new Headers({ location: "https://evil.example/setup.exe" }) };
  await assert.rejects(resolveGmdxDownload(fetcher), /trusted GMDX file URL/);
});

test("rejects a package that does not match the author's hash", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gmdx-test-"));
  try {
    const file = path.join(dir, "installer.exe");
    await fs.writeFile(file, "not the official installer");
    await assert.rejects(verifyGmdxInstaller(file), /checksum/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
