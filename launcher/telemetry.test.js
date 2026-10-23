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

    const edition = { gameSlug: "openra", editionSlug: "official" };
    await telemetry.editionLaunched(edition);
    await telemetry.editionExited(edition);
    assert.deepEqual(
      events.map((item) => item.event),
      ["launcher_install", "edition_launched", "game_ended"],
      "a play session has one start and one end event"
    );

    // A game can launch an edition other than the install record's default.
    // The exit must use that launched edition, or no duration is sent.
    const daggerfallOnline = { gameSlug: "daggerfall", editionSlug: "daggerfall-online" };
    await telemetry.editionLaunched(daggerfallOnline);
    const unmatched = await telemetry.editionExited({ gameSlug: "daggerfall", editionSlug: "classic-dos" });
    assert.equal(unmatched.ok, false);
    await telemetry.editionExited(daggerfallOnline);
    assert.deepEqual(events.slice(-2).map((item) => [item.event, item.properties.editionSlug]), [
      ["edition_launched", "daggerfall-online"],
      ["game_ended", "daggerfall-online"],
    ]);
    assert.equal(typeof events.at(-1).properties.durationMs, "number");

    // Offline events are queued and resent, oldest first, once the site answers.
    const os = require("node:os");
    const fs = require("node:fs");
    const path = require("node:path");
    const queueFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "pb-telemetry-")), "queue.json");
    let online = false;
    const delivered = [];
    global.fetch = async (_url, init) => {
      if (!online) throw new Error("offline");
      delivered.push(JSON.parse(init.body).event);
      return { ok: true, status: 200 };
    };
    delete require.cache[require.resolve("./telemetry")];
    const queued = require("./telemetry").createTelemetry({
      getApiBase: () => "https://example.test",
      loadSettings: () => ({ analyticsId: "analytics-id-123456" }),
      saveSettings: () => {},
      getAppVersion: () => "9.9.9",
      queueFile,
    });
    await queued.track("edition_launched", {});
    await queued.track("game_ended", {});
    assert.equal(JSON.parse(fs.readFileSync(queueFile, "utf8")).length, 2, "failed sends are kept");
    online = true;
    const flushed = await queued.flushQueue();
    assert.equal(flushed.sent, 2);
    assert.deepEqual(delivered, ["edition_launched", "game_ended"], "resent in order");
    assert.equal(fs.existsSync(queueFile), false, "an empty queue removes its file");

    // A 4xx is the event's own fault: it is dropped, not retried forever.
    global.fetch = async () => ({ ok: false, status: 400 });
    await queued.track("bad_event", {});
    assert.equal(fs.existsSync(queueFile), false, "4xx responses are not queued");
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
