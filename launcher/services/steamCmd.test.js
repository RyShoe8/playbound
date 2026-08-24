const assert = require("assert");
const { EventEmitter } = require("events");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { createSteamCmdInstaller, STEAMCMD_WINDOWS_URL } = require("./steamCmd");

async function main() {
  const calls = { downloads: [], extracts: [], spawns: [] };
  const fakeRoot = path.join(os.tmpdir(), `playbound-steamcmd-test-${process.pid}`);
  const fakeBinary = path.join(fakeRoot, "runtimes", "steamcmd", "steamcmd.exe");

  const spawnImpl = (binary, args, options) => {
    calls.spawns.push({ binary, args, options });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    queueMicrotask(() => child.emit("close", 0));
    return child;
  };

  try {
    const installer = createSteamCmdInstaller({
      userDataPath: fakeRoot,
      tempPath: path.join(fakeRoot, "temp"),
      platform: "win32",
      downloadTo: async (...args) => {
        calls.downloads.push(args);
        await fsp.mkdir(path.dirname(args[1]), { recursive: true });
        await fsp.writeFile(args[1], "test archive");
      },
      extractArchive: async (...args) => {
        calls.extracts.push(args);
        await fsp.mkdir(args[1], { recursive: true });
        await fsp.writeFile(fakeBinary, "test binary");
      },
      spawnImpl,
    });
    await installer.install({ appId: "1136510", installDir: "C:\\Games\\Warfork", title: "Warfork" });
    assert.equal(calls.downloads.length, 1);
    assert.equal(calls.downloads[0][0], STEAMCMD_WINDOWS_URL);
    assert.equal(calls.extracts.length, 1);
    assert.equal(calls.spawns.length, 1);
    assert.equal(calls.spawns[0].binary, fakeBinary);
    assert.deepEqual(calls.spawns[0].args.slice(-6), [
      "+login",
      "anonymous",
      "+app_update",
      "1136510",
      "validate",
      "+quit",
    ]);
    assert(calls.spawns[0].args.includes("+force_install_dir"));
    assert.equal(
      calls.spawns[0].args[calls.spawns[0].args.indexOf("+login") + 1],
      "anonymous",
      "managed installs must never request player credentials"
    );
    assert.match(STEAMCMD_WINDOWS_URL, /^https:\/\/steamcdn-a\.akamaihd\.net\//);
    await assert.rejects(
      () => installer.install({ appId: "not-an-id", installDir: "C:\\Games\\Bad" }),
      /numeric app ID/
    );
  } finally {
    await fsp.rm(fakeRoot, { recursive: true, force: true });
  }
  console.log("steamCmd tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
