"use strict";

const fs = require("fs");
const path = require("path");
const openborCfg = require("../openborCfg");
const { isFirstRun, markFirstRunDone } = require("./firstRun");

/*
 * X-Men Arcade Remake (OpenBOR, 352-byte cfg): ships with P1 unbound and
 * windowed. Bind the play-tested DualSense layout when P1 has no keys at
 * all, and on the first launch only turn on fullscreen and the play-tested
 * display options.
 */
module.exports = {
  slugs: ["x-men-arcade-remake"],
  async prepare(ctx) {
    const cfgPath = path.join(path.dirname(ctx.info.exe || ""), "Saves", "XMEN_Arcade.cfg");
    if (!fs.existsSync(cfgPath)) return null;
    const firstRun = isFirstRun(ctx);
    const original = fs.readFileSync(cfgPath);
    let buf = openborCfg.bindUnboundP1(original, openborCfg.XMEN_DUALSENSE_P1_KEYS) || original;
    buf = openborCfg.applyOpenBorFullscreen(buf, { firstRun }) || buf;
    if (firstRun) buf = openborCfg.applyXmenDisplayDefaults(buf) || buf;
    if (!buf.equals(original)) fs.writeFileSync(cfgPath, buf);
    if (firstRun) markFirstRunDone(ctx);
    return null;
  },
};
