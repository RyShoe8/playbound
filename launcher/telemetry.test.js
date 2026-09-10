const assert = require("node:assert/strict");

async function main() {
  const originalFetch = global.fetch;
  const events = [];
  let settings = {};
  global.fetch = async (_url, init) => {
    events.push(JSON.parse(init.body));
    return { ok: true };
  };

  try {
    delete require.cache[require.resolve("./telemetry")];
    const { createTelemetry } = require("./telemetry");
    const telemetry = createTelemetry({
      getApiBase: () => "https://example.test",
      loadSettings: () => ({ ...settings }),
      saveSettings: (next) => {
        settings = { ...next };
      },
      getAppVersion: () => "9.9.9",
    });

    const [first, shared] = await Promise.all([
      telemetry.launcherInstalled(),
      telemetry.launcherInstalled(),
    ]);
    assert.equal(first.ok, true);
    assert.equal(shared.ok, true);
    assert.equal(events.length, 1, "concurrent startup calls share one request");
    assert.equal(events[0].event, "launcher_install");
    assert.equal(settings.launcherInstallTrackedId, settings.analyticsId);

    const again = await telemetry.launcherInstalled();
    assert.equal(again.alreadyTracked, true);
    assert.equal(events.length, 1, "a successful install event is persisted once");
  } finally {
    global.fetch = originalFetch;
  }
}

main().then(
  () => console.log("telemetry tests passed"),
  (err) => {
    console.error(err);
    process.exitCode = 1;
  }
);
