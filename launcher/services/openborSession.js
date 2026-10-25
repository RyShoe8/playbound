"use strict";
const fs = require("fs");
const path = require("path");
const cfg = require("./openborCfg");
const sessions = new Map();

// Recognize the engine by its saved-data header, including renamed executables.
// Only direct Saves folders beside the resolved executable/install are examined.
function configs(info) {
  const result = [];
  for (const dir of new Set([info?.exe && path.dirname(info.exe), info?.dir].filter(Boolean))) {
    const saves = path.join(dir, "Saves");
    if (!fs.existsSync(saves)) continue;
    const info = fs.lstatSync(saves);
    if (!info.isDirectory() || info.isSymbolicLink()) continue;
    for (const item of fs.readdirSync(saves, {withFileTypes:true}).slice(0,128)) {
      if (!item.isFile() || !/\.cfg$/i.test(item.name)) continue;
      const file = path.join(saves,item.name);
      const size = fs.statSync(file).size;
      if (size !== 348 && size !== 352) continue;
      const data = fs.readFileSync(file);
      if (cfg.isOpenBorCfg(data) && !result.some(row => row.file === file)) result.push({file,data});
    }
  }
  return result;
}

function prepare(slug, info, {streaming=false, profile=null} = {}) {
  const files = configs(info);
  if (!files.length) return null;
  const restores = sessions.get(slug) || [];
  for (const {file,data} of files) {
    let next = profile ? cfg.applyOpenBorP1Keys(data,profile) || data : data;
    if (streaming) {
      const offset = data.length-28;
      if (!restores.some(row => row.file === file)) restores.push({file,size:data.length,version:data.readUInt32LE(0),fullscreen:data.readInt32LE(offset)});
      next = Buffer.from(next);
      // Exclusive SDL fullscreen can stop desktop capture delivering frames.
      next.writeInt32LE(0,offset);
    }
    if (!next.equals(data)) fs.writeFileSync(file,next);
  }
  if (restores.length) sessions.set(slug,restores);
  return {__COMPAT_LAYER:"HighDpiAware"};
}

function restore(slug) {
  const restores = sessions.get(slug) || [];
  sessions.delete(slug);
  for (const saved of restores) {
    try {
      const data = fs.readFileSync(saved.file);
      if (data.length !== saved.size || data.readUInt32LE(0) !== saved.version) continue;
      // Preserve controls, progress and any other settings written by the game.
      if (data.readInt32LE(data.length-28) !== 0) continue;
      data.writeInt32LE(saved.fullscreen,data.length-28);
      fs.writeFileSync(saved.file,data);
    } catch (error) { console.warn("[openbor] display preference restore failed:",error.code || "read/write failure"); }
  }
}
module.exports = {configs,prepare,restore};
