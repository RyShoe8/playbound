const { test } = require("node:test");
const assert = require("node:assert/strict");
const { mediafireArchiveHref, resolveMediafireArchive } = require("./mediafireDownload");

test("selects the 7z download button, not an ad link", () => {
  const html = '<a href="https://evil.test/ad.7z">ad</a><a href="https://download1349.mediafire.com/token/key/patch.7z" id="downloadButton">Download</a>';
  assert.equal(mediafireArchiveHref(html), "https://download1349.mediafire.com/token/key/patch.7z");
  assert.throws(() => mediafireArchiveHref('<a href="https://evil.test/patch.7z" id="downloadButton">Download</a>'));
});

test("rejects an unrelated source page", async () => {
  await assert.rejects(resolveMediafireArchive("https://evil.test/file/key/patch.7z/file", async () => {
    throw new Error("should not fetch");
  }));
});
