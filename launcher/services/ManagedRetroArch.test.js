const assert = require("assert");
const path = require("path");
const os = require("os");
const { randomUUID } = require("crypto");
const { managedRetroArchRoot, runtimeBinary, coreBinary, createManagedRetroArch } = require("./ManagedRetroArch");
const root = managedRetroArchRoot("C:\\PlayBoundData");
assert.equal(root, path.join("C:\\PlayBoundData", "runtimes", "retroarch"));
assert.equal(runtimeBinary(root), path.join(root, "current", "retroarch.exe"));
assert.equal(coreBinary(root, "puae"), path.join(root, "current", "cores", "puae_libretro.dll"));
assert.equal(coreBinary(root, "unknown"), null);
const declined = createManagedRetroArch({
  userDataPath: path.join(os.tmpdir(), `playbound-retroarch-${randomUUID()}`),
  onBeforeInstall: async () => false,
  downloadTo: async () => { throw new Error("download must not start after cancellation"); },
});
declined.ensureRuntime().then((result) => {
  assert.equal(result.ok, false);
  assert.match(result.error, /cancelled/);
  console.log("ManagedRetroArch tests passed");
}).catch((error) => { process.exitCode = 1; throw error; });
