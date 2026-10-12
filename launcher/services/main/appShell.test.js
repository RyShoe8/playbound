const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function loadShell(validImages) {
  const image = (valid) => ({ isEmpty: () => !valid, resize() { return this; } });
  const context = {
    Buffer, console: { warn() {} }, __dirname, module: { exports: {} },
    process: { platform: 'win32', resourcesPath: 'resources' },
    require(name) {
      if (name === 'electron') return { app: {}, nativeImage: {
        createFromBuffer: (buffer) => image(validImages.includes(buffer.toString())),
        createFromPath: () => image(false),
        createFromBitmap: (buffer, size) => {
          assert.equal(buffer.length, size.width * size.height * 4);
          return image(true);
        },
      } };
      if (name === 'fs') return { existsSync: () => true, readFileSync: (file) => Buffer.from(path.basename(file)) };
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
