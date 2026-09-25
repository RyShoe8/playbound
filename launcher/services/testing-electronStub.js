"use strict";

/**
 * Require a main-process module from a plain Node test.
 *
 * services/main/* import `electron`, which outside Electron resolves to the
 * binary's path, not the API. This installs a minimal stand-in first: app
 * paths point at a temp directory and everything else is an inert no-op, so
 * a module loads and its pure functions can be called directly.
 */
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");

let installed = false;
function installElectronStub() {
  if (installed) return;
  installed = true;
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), "pb-launcher-test-"));
  const inert = () =>
    new Proxy(function () {}, {
      get: (_t, prop) => (prop === "then" ? undefined : inert()),
      apply: () => inert(),
      construct: () => inert(),
    });
  const app = new Proxy(
    { getPath: () => userData, isPackaged: false, getVersion: () => "0.0.0-test", getAppPath: () => path.join(__dirname, "..") },
    { get: (t, prop) => (prop in t ? t[prop] : inert()) }
  );
  const electron = new Proxy({ app }, { get: (t, prop) => (prop in t ? t[prop] : inert()) });
  const load = Module._load;
  Module._load = function (request, ...rest) {
    if (request === "electron") return electron;
    return load.call(this, request, ...rest);
  };
}

function requireMainModule(name) {
  installElectronStub();
  return require(path.join(__dirname, "main", name));
}

module.exports = { requireMainModule };
