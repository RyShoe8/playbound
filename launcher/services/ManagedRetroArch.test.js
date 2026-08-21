const assert = require("assert");
const path = require("path");
const { managedRetroArchRoot, runtimeBinary, coreBinary } = require("./ManagedRetroArch");
const root = managedRetroArchRoot("C:\\PlayBoundData");
assert.equal(root, path.join("C:\\PlayBoundData", "runtimes", "retroarch"));
assert.equal(runtimeBinary(root), path.join(root, "current", "retroarch.exe"));
assert.equal(coreBinary(root, "puae"), path.join(root, "current", "cores", "puae_libretro.dll"));
assert.equal(coreBinary(root, "unknown"), null);
console.log("ManagedRetroArch tests passed");
