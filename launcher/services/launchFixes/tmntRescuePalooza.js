"use strict";

const fs = require("fs");
const path = require("path");
const openborCfg = require("../openborCfg");
const openborPak = require("../openborPak");
const gameControllerConfig = require("../gameControllerConfig");
const { isFirstRun, markFirstRunDone } = require("./firstRun");

/*
 * TMNT Rescue-Palooza (OpenBOR).
 * - Strip the long cross-promo boot scene from the pak.
 * - Fullscreen on the primary monitor: DPI-unaware, Windows scales its
 *   fullscreen window past a 150% screen, and its own fullscreen option also
 *   picks a stretch mode that spans every monitor. Both verified on a
 *   4K / 150% desktop.
 */
module.exports = {
  slugs: ["tmnt-rescue-palooza"],
  async prepare(ctx) {
    const root = ctx.info.dir || path.dirname(ctx.info.exe || "");
    try {
      const result = await openborPak.stripTmntBootAds(root);
      if (result.changed) console.log("[tmnt] stripped boot ads from", result.pakPath);
    } catch (err) {
      console.warn("[tmnt] boot-ad strip skipped:", err?.message || err);
    }

    if (ctx.platform !== "win32") return null;
    // The DPI-aware launch matters even when the cfg cannot be touched.
    try {
      const cfgPath = gameControllerConfig.configPathFor(ctx.slug, root);
      if (cfgPath && fs.existsSync(cfgPath)) {
        const firstRun = isFirstRun(ctx);
        const next = openborCfg.applyOpenBorFullscreen(fs.readFileSync(cfgPath), { firstRun });
        if (next) fs.writeFileSync(cfgPath, next);
        if (firstRun) markFirstRunDone(ctx);
      }
    } catch (err) {
      console.warn("[tmnt] fullscreen setup skipped:", err?.message || err);
    }
    return { env: { __COMPAT_LAYER: "HighDpiAware" } };
  },
};
