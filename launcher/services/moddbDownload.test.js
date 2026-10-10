"use strict";
const assert = require("node:assert/strict");
const { isModdbFilePage, parseModdbFilePage, mirrorPath, assertCdnUrl, resolveModdbDownload } = require("./moddbDownload");

const PAGE = `<div class="row clear"><h5>Filename</h5><span class="summary">
 KotOR_Ultimate_2_0_Endar_Spire.zip </span></div>
<div class="row clear"><h5>MD5 Hash</h5><span class="summary"> NOT-A-HASH </span></div>
<a href="/downloads/start/117185?referer=x">Download</a>`;
const START = `<p><a href="/downloads/mirror/117185/134/ec425f6260f50ba4dc1f02cd0dd5323b">download</a></p>`;

assert.ok(isModdbFilePage("https://www.moddb.com/mods/kotor-ultimate/downloads/kotor-ultimate-20-endar-spire"));
assert.ok(isModdbFilePage("https://www.moddb.com/addons/screen-space-shaders/downloads/x"));
assert.ok(!isModdbFilePage("https://evil.example/mods/a/downloads/b"));
assert.ok(!isModdbFilePage("http://www.moddb.com/mods/a/downloads/b"));
assert.ok(!isModdbFilePage("https://www.moddb.com/mods/a"));

const parsed = parseModdbFilePage(PAGE);
assert.equal(parsed.filename, "KotOR_Ultimate_2_0_Endar_Spire.zip");
assert.equal(parsed.startId, "117185");
assert.equal(parsed.md5, null, "a malformed hash is dropped rather than trusted");
assert.equal(parseModdbFilePage(PAGE.replace("NOT-A-HASH", "a60fa86e6a3f88b6f1e5bd73cefa9808")).md5, "a60fa86e6a3f88b6f1e5bd73cefa9808");

assert.equal(mirrorPath(START), "/downloads/mirror/117185/134/ec425f6260f50ba4dc1f02cd0dd5323b");
assert.throws(() => mirrorPath("<p>nothing</p>"), /mirror/);
assert.ok(assertCdnUrl("https://fmt5.dl.dbolical.com/dl/x.zip?st=a&e=1"));
assert.throws(() => assertCdnUrl("https://evil.example/x.zip"), /unexpected/);
assert.throws(() => assertCdnUrl("http://fmt5.dl.dbolical.com/x.zip"), /unexpected/);

(async () => {
  const good = PAGE.replace("NOT-A-HASH", "a60fa86e6a3f88b6f1e5bd73cefa9808");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (/\/downloads\/start\//.test(url)) return { ok: true, status: 200, text: async () => START };
    return { ok: true, status: 200, text: async () => good };
  };
  const redirect = async (url, referer) => {
    assert.match(url, /\/downloads\/mirror\/117185\/134\//);
    assert.equal(referer, "https://www.moddb.com/downloads/start/117185");
    return "https://fmt5.dl.dbolical.com/dl/2017/01/13/a.zip?st=z&e=9";
  };
  const r = await resolveModdbDownload("https://www.moddb.com/mods/kotor-ultimate/downloads/kotor-ultimate-20-endar-spire", fetchImpl, redirect);
  assert.equal(r.filename, "KotOR_Ultimate_2_0_Endar_Spire.zip");
  assert.equal(r.md5, "a60fa86e6a3f88b6f1e5bd73cefa9808");
  assert.match(r.url, /^https:\/\/fmt5\.dl\.dbolical\.com\//);
  assert.equal(calls.length, 2);

  await assert.rejects(
    resolveModdbDownload("https://www.moddb.com/mods/a/downloads/b", fetchImpl, async () => "https://evil.example/a.zip"),
    /unexpected/
  );
  console.log("moddbDownload tests passed");
})();
