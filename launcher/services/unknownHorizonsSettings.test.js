/**
 * Unknown Horizons display defaults (safe 1280×720 windowed).
 */

"use strict";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  DEFAULT_RESOLUTION,
  ensureUnknownHorizonsSafeDisplay,
  userConfigPath,
} = require("./unknownHorizonsSettings");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "uh-settings-"));
process.env.XDG_CONFIG_HOME = tmp;

(async () => {
  const file = userConfigPath();
  assert.ok(file.includes("unknown-horizons"));

  assert.equal(await ensureUnknownHorizonsSafeDisplay(), true);
  assert.ok(fs.existsSync(file));
  let text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes(DEFAULT_RESOLUTION));
  assert.ok(/FullScreen[^>]*>\s*False/i.test(text));

  // Second pass is a no-op when already safe.
  assert.equal(await ensureUnknownHorizonsSafeDisplay(), false);

  // Oversized resolution gets clamped and windowed.
  fs.writeFileSync(
    file,
    `<?xml version="1.0"?>
<Settings>
  <Module name="FIFE">
    <Setting name="FullScreen" type="bool">True</Setting>
    <Setting name="ScreenResolution" type="str">3840x2160</Setting>
  </Module>
</Settings>
`,
    "utf8"
  );
  assert.equal(await ensureUnknownHorizonsSafeDisplay(), true);
  text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes(DEFAULT_RESOLUTION));
  assert.ok(/FullScreen[^>]*>\s*False/i.test(text));
  assert.ok(!text.includes("3840x2160"));

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("unknownHorizonsSettings.test.js: ok");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
