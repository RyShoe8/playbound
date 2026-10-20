"use strict";

const path = require("path");

/*
 * Games whose only pre-launch fix is writing a sane display setting into the
 * game's own config before it reads it. Each was an inline block in
 * playGameInner; behaviour is unchanged.
 */

const openciv3 = {
  slugs: [require("../../openciv3Display").OPENCIV3_SLUG],
  async prepare(ctx) {
    await require("../../openciv3Display").ensureDefaultDisplaySettings(ctx.info.exe || ctx.info.dir);
    return null;
  },
};

const unknownHorizons = {
  slugs: [require("../unknownHorizonsLaunch").UH_SLUG],
  async prepare() {
    await require("../unknownHorizonsSettings").ensureUnknownHorizonsSafeDisplay();
    return null;
  },
};

const outrun = {
  slugs: ["outrun"],
  async prepare(ctx) {
    const result = await require("../../outrunDisplay").ensureOutrunWindowSize({
      dirs: [ctx.info.dir, ctx.info.exe ? path.dirname(ctx.info.exe) : null],
      workArea: ctx.workArea,
    });
    if (result.changed) console.log(`[outrun] window size set to index ${result.index}`);
    return null;
  },
};

const holocure = {
  slugs: ["holocure"],
  async prepare() {
    await require("../../holocureDisplay").ensureHolocureFullscreen();
    return null;
  },
};

const renegadeX = {
  slugs: ["renegade-x"],
  async prepare(ctx) {
    // Loaded lazily: gameFixes needs Electron, the registry must not.
    await require("../main/gameFixes").maybePrepareRenegadeX(ctx.info);
    return null;
  },
};

module.exports = [openciv3, unknownHorizons, outrun, holocure, renegadeX];
