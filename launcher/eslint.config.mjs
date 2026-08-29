/**
 * One rule: no-undef.
 *
 * The launcher had two references to names that did not exist — `isJar` in a
 * launch error handler, and `mainWindow` in the notification click handler.
 * Both files parsed, so `node --check` passed them; both are only reached on a
 * specific path, so requiring the module passed them too. The first turned
 * every launch failure into "ReferenceError: isJar is not defined" and hid the
 * real reason, and the second meant clicking a notification silently did
 * nothing. A third, `enableDiscoverNat`, was at module scope and stopped the
 * app from starting at all — that one shipped in three releases.
 *
 * Static scope analysis is the only thing that catches all three before a
 * user does. Deliberately just this one rule: the launcher has no lint history
 * and turning on a whole preset would bury a real finding under style noise.
 * Add rules when someone intends to fix what they surface.
 */

const nodeGlobals = {
  require: "readonly",
  module: "writable",
  exports: "writable",
  process: "readonly",
  console: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  TextDecoder: "readonly",
  TextEncoder: "readonly",
  AbortController: "readonly",
  AbortSignal: "readonly",
  DOMException: "readonly",
  fetch: "readonly",
  crypto: "readonly",
  structuredClone: "readonly",
  queueMicrotask: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  Intl: "readonly",
};

const browserGlobals = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  location: "readonly",
  alert: "readonly",
  confirm: "readonly",
  prompt: "readonly",
  Image: "readonly",
  Event: "readonly",
  CustomEvent: "readonly",
  WebSocket: "readonly",
  RTCPeerConnection: "readonly",
  MutationObserver: "readonly",
  ResizeObserver: "readonly",
  IntersectionObserver: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  getComputedStyle: "readonly",
  matchMedia: "readonly",
  Notification: "readonly",
  Blob: "readonly",
  FileReader: "readonly",
  HTMLElement: "readonly",
  HTMLSelectElement: "readonly",
  HTMLInputElement: "readonly",
  Element: "readonly",
  Node: "readonly",
};

export default [
  {
    ignores: ["node_modules/**", "dist/**", "dist-build-*/**", "resources/**", "tools/**"],
  },
  {
    // Main process and services: CommonJS, Node globals.
    files: ["*.js", "services/**/*.js", "scripts/**/*.js", "platform/**/*.js"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "commonjs",
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: { "no-undef": "error" },
  },
  {
    // Renderer: ES modules in a browser context.
    files: ["renderer/**/*.js", "renderer/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...browserGlobals, ...nodeGlobals },
    },
    rules: { "no-undef": "error" },
  },
];
