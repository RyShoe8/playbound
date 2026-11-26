const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadShell(validImages, { platform = 'win32', assetVersion = 'v1', cache = new Map() } = {}) {
  const image = (valid) => ({ isEmpty: () => !valid, resize() { return this; } });
  const context = {
    Buffer, console: { warn() {} }, __dirname, module: { exports: {} },
    process: { platform, resourcesPath: 'resources' },
    require(name) {
      if (name === 'electron') return { app: { getPath: () => 'userdata' }, nativeImage: {
        createFromBuffer: (buffer) => image(validImages.includes(buffer.toString())),
        createFromPath: () => image(false),
        createFromBitmap: (buffer, size) => {
          assert.equal(buffer.length, size.width * size.height * 4);
          return image(true);
        },
      } };
      if (name === 'fs') return {
        existsSync: file => file.startsWith('userdata') ? cache.has(file) : true,
        readFileSync: file => Buffer.from(platform === 'linux' ? assetVersion : path.basename(file)),
        writeFileSync: (file, buffer) => cache.set(file, buffer),
      };
      if (name === './core') return {};
      return require(name);
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'appShell.js'), 'utf8'), context);
  return context.module.exports;
}

test('tray returns a decoded image when its tray asset is damaged', () => {
  const icon = loadShell(['icon.png']).getTrayIcon();
  assert.equal(typeof icon, 'object');
  assert.equal(icon.isEmpty(), false);
});

test('tray remains usable when every packaged image is missing or corrupt', () => {
  const icon = loadShell([]).getTrayIcon();
  assert.equal(typeof icon, 'object');
  assert.equal(icon.isEmpty(), false);
});

test('Linux tray changes its cache path when an update changes the artwork', () => {
  const cache = new Map([[path.join('userdata', 'tray-icon.png'), Buffer.from('old logo')]]);
  const first = loadShell([], { platform: 'linux', assetVersion: 'old', cache }).getTrayIcon();
  const current = loadShell([], { platform: 'linux', assetVersion: 'arcade', cache }).getTrayIcon();
  assert.notEqual(first, current);
  assert.equal(cache.get(current).toString(), 'arcade');
  const again = loadShell([], { platform: 'linux', assetVersion: 'arcade', cache }).getTrayIcon();
  assert.equal(again, current);
});
