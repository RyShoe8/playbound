"use strict";

const fs = require("fs");
const path = require("path");

/*
 * Streets of Rage Remake starts as a tiny window with the first joystick
 * Windows lists bound, and keeps both in savegame/savegame.sor beside the
 * game. With no save there yet, start from a play-tested, name-free one
 * (fullscreen, DualSense bound). An existing save is never touched.
 */
module.exports = {
  slugs: ["streets-of-rage-remake"],
  async prepare(ctx) {
    const saveDir = path.join(path.dirname(ctx.info.exe || ""), "savegame");
    const target = path.join(saveDir, "savegame.sor");
    const template = ctx.resourceRoots
      .map((root) => path.join(root, "game-defaults", ctx.slug, "savegame.sor"))
      .find((p) => fs.existsSync(p));
    if (template && !fs.existsSync(target)) {
      fs.mkdirSync(saveDir, { recursive: true });
      fs.copyFileSync(template, target);
      console.log("[sor] seeded default settings");
    }
    return null;
  },
};
