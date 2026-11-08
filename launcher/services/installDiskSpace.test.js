const test = require("node:test");
const assert = require("node:assert/strict");
const { isDiskSpaceError, diskSpaceMessage } = require("./installDiskSpace");

test("recognizes filesystem, extraction and preflight disk-space failures", () => {
  for (const error of [
    { code: "ENOSPC", message: "write failed" },
    { code: "DISK_FULL", message: diskSpaceMessage({ code: "ENOSPC" }) },
    { message: "Extraction failed", stderrTail: "There is not enough space on the disk." },
    { message: "Download failed", cause: { code: "ENOSPC" } },
    { message: "Not enough free disk space on target drive D:" },
  ]) assert.equal(isDiskSpaceError(error), true);
  assert.equal(isDiskSpaceError({ message: "HTTP 503 download failed" }), false);
  assert.equal(isDiskSpaceError({ message: "EACCES permission denied" }), false);
});

test("keeps preflight measurements and explains unexpected filesystem failures", () => {
  const message = "Game requires 10 GB but only 2 GB is available.";
  assert.equal(diskSpaceMessage({ message }), message);
  assert.match(diskSpaceMessage({ code: "ENOSPC" }), /another drive/);
});
