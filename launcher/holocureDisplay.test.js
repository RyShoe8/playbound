"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const fsp = require("fs/promises");
const os = require("os");
const path = require("path");
const { ensureHolocureFullscreen, settingsPath } = require("./holocureDisplay");

describe("holocureDisplay", () => {
  it("creates settings with fullscreen and default controllerButtons", async () => {
    const localAppData = await fsp.mkdtemp(path.join(os.tmpdir(), "hc-"));
    const out = await ensureHolocureFullscreen({ localAppData });
    assert.equal(out.created, true);
    const data = JSON.parse(await fsp.readFile(settingsPath(localAppData), "utf8"));
    assert.equal(data.fullscreen, true);
    assert.ok(Array.isArray(data.controllerButtons));
    assert.ok(data.controllerButtons.length > 0);
  });

  it("sets fullscreen true without clobbering other keys or controllerButtons", async () => {
    const localAppData = await fsp.mkdtemp(path.join(os.tmpdir(), "hc-"));
    const file = settingsPath(localAppData);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(
      file,
      JSON.stringify({
        fullscreen: false,
        musicVolume: 0.5,
        controllerButtons: ["gp_face1"],
      }),
      "utf8"
    );
    await ensureHolocureFullscreen({ localAppData });
    const data = JSON.parse(await fsp.readFile(file, "utf8"));
    assert.equal(data.fullscreen, true);
    assert.equal(data.musicVolume, 0.5);
    assert.deepEqual(data.controllerButtons, ["gp_face1"]);
  });

  it("recovers from malformed JSON", async () => {
    const localAppData = await fsp.mkdtemp(path.join(os.tmpdir(), "hc-"));
    const file = settingsPath(localAppData);
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, "{not-json", "utf8");
    await ensureHolocureFullscreen({ localAppData });
    const data = JSON.parse(await fsp.readFile(file, "utf8"));
    assert.equal(data.fullscreen, true);
  });
});
