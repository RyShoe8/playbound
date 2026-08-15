/**
 * electron-builder.js
 *
 * Build configuration for the PlayBound Windows launcher.
 *
 * This previously lived in the "build" field of package.json. It moved here so
 * signing can be decided at build time from environment variables — static JSON
 * cannot express "sign only when credentials exist".
 *
 * ---------------------------------------------------------------------------
 * TWO WAYS THIS FILE CAN BE SILENTLY IGNORED — both produce a build that
 * "succeeds" with default settings and wrong artifact names, so check here
 * first if output looks unexpected:
 *
 *  1. THE FILENAME. electron-builder v25 searches for `electron-builder.{yml,
 *     yaml,json,json5,toml,js,cjs,ts}` — it does NOT look for the commonly
 *     seen `electron-builder.config.js`. Renaming this file breaks discovery
 *     without any warning.
 *     (app-builder-lib/out/util/config/load.js → findAndReadConfig)
 *
 *  2. A "build" KEY IN package.json. electron-builder checks package.json
 *     first and, if a "build" key exists, never looks for this file at all.
 *     Do not reintroduce it.
 *     (app-builder-lib/out/util/config/load.js → loadConfig)
 *
 * Symptom of either: the packaged exe is named after package.json "name"
 * (playbound-launcher.exe) instead of productName (PlayBound.exe).
 * ---------------------------------------------------------------------------
 *
 * Everything not related to signing is byte-for-byte what it was before, so
 * unsigned development builds produce exactly the artifacts they always did.
 *
 * See docs/windows-code-signing.md for the full signing guide.
 */

"use strict";

const {
  EXTRA_SIGN_EXTS,
  resolveSigningConfig,
  reportSigningConfig,
} = require("./scripts/signing-config");

const signing = resolveSigningConfig();
// Throws when signing is required but misconfigured, so a broken production
// release fails here rather than shipping an unsigned installer.
const signingActive = reportSigningConfig(signing, { label: "signing" });

/** Windows options applied only when signing is switched on. */
const windowsSigningOptions = signingActive
  ? {
      // Must be true to sign the main executable. It is false in the unsigned
      // path below to preserve the exact pre-existing build behaviour.
      signAndEditExecutable: true,
      signtoolOptions: signing.signtoolOptions,
      ...(signing.signAllBinaries ? { signExts: EXTRA_SIGN_EXTS } : {}),
    }
  : {
      signAndEditExecutable: false,
    };

module.exports = {
  appId: "gg.playbound.launcher",
  productName: "PlayBound",
  // Single 1024x1024 source; electron-builder derives .ico (win) and .icns
  // (mac) from it automatically, and uses it as-is for the Linux AppImage.
  // Without this, electron-builder falls back to its own default Electron
  // icon for every platform. Lives in assets/, not the conventional build/,
  // because the repo's root .gitignore excludes any "build" directory.
  icon: "assets/icon.png",
  files: [
    "main.js",
    "bootstrap.js",
    "preload.js",
    "catalog.js",
    "telemetry.js",
    "hardware.js",
    "utm.js",
    "openciv3Display.js",
    "platform/**/*",
    "services/**/*",
    "renderer/**/*",
    "assets/**/*",
  ],
  // systeminformation shells out to helpers; unpack so Windows detection works reliably.
  // assets is unpacked so Linux D-Bus/AppIndicator can read tray icons from real disk files.
  asarUnpack: ["**/node_modules/systeminformation/**", "assets/**/*"],
  protocols: {
    name: "PlayBound Deep Link",
    schemes: ["playbound"],
  },

  // Hard-fail the build if electron-builder cannot sign after we have committed
  // to signing. Without this, electron-builder logs a warning and happily emits
  // an unsigned installer.
  // Only force signing for Windows production builds. Mac notarization is separate
  // (CSC_LINK / APPLE_ID) and must not fail Mac DMGs when only WINDOWS_CERT_* is set.
  forceCodeSigning: signingActive && process.platform === "win32",

  publish: [
    {
      provider: "generic",
      url: "https://mt8u2b96lweefbpb.public.blob.vercel-storage.com/launcher/",
      channel: signingActive ? "latest" : "admin"
    },
  ],

  win: {
    target: ["nsis", "portable"],
    artifactName: "PlayBound-Setup-${version}.${ext}",
    /*
     * An explicit multi-size .ico rather than letting electron-builder convert
     * the PNG. Its conversion emits a single 256x256 entry, which Windows then
     * downscales for the 32px taskbar and 16px window chrome — soft at best,
     * and on some surfaces it falls back instead of using it. This carries
     * exact 16/24/32/48/64/128/256 entries. Regenerate from assets/icon.png if
     * the mark changes.
     */
    icon: "assets/icon.ico",
    ...windowsSigningOptions,
  },

  nsis: {
    oneClick: true,
    perMachine: false,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "PlayBound",
    artifactName: "PlayBound-Setup-${version}.${ext}",
  },

  portable: {
    artifactName: "PlayBound-Launcher-Portable-${version}.${ext}",
  },

  mac: {
    target: {
      target: "dmg",
      arch: ["universal"],
    },
    artifactName: "PlayBound-macOS-${version}.${ext}",
    category: "public.app-category.games",
  },

  dmg: {
    title: "PlayBound",
    artifactName: "PlayBound-macOS-${version}.${ext}",
  },

  linux: {
    target: ["AppImage"],
    category: "Game",
    artifactName: "PlayBound-Linux-${version}.${ext}",
    synopsis: "Discover, install, update, and launch free PC games",
    desktop: {
      StartupWMClass: "PlayBound",
    },
  },
};
