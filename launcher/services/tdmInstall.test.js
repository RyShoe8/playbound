const assert = require("assert");
const {
  isDarkModSlug,
  isTdmInstallerBasename,
  tdmUnattendedArgs,
  tdmInstallerPollMaxMs,
} = require("./tdmInstall");

assert.strictEqual(isDarkModSlug("the-dark-mod"), true);
assert.strictEqual(isDarkModSlug("other"), false);
assert.strictEqual(isTdmInstallerBasename("tdm_installer.exe"), true);
assert.strictEqual(isTdmInstallerBasename("tdm_installer.linux64"), true);
assert.strictEqual(isTdmInstallerBasename("TheDarkModx64.exe"), false);
assert.deepStrictEqual(tdmUnattendedArgs(), ["--unattended"]);
assert.ok(tdmInstallerPollMaxMs() >= 60 * 60 * 1000);

console.log("tdmInstall.test.js: ok");
