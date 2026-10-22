const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
test('missing controller driver explains its purpose before requesting Windows installation', async () => {
  const source = fs.readFileSync(path.join(__dirname, 'couch/ensureVigem.js'), 'utf8');
  let prompt;
  let spawned = false;
  const context = { __dirname: path.join(__dirname, 'couch'), process: { platform: 'win32' }, module: { exports: {} }, setTimeout,
    require: (name) => {
      if (name === 'path') return path;
      if (name === 'fs') return { existsSync: () => true };
      if (name === 'child_process') return { spawn: () => { spawned = true; throw Error('must not install after cancel'); } };
      if (name === './VirtualControllerProvider') return { createProvider: () => ({ probe: async () => ({ ok: false }) }) };
      if (name === 'electron') return { dialog: { showMessageBox: async (options) => { prompt = options; return { response: 1 }; } } };
      throw Error('Unexpected dependency');
    } };
  vm.createContext(context); vm.runInContext(source, context);
  const result = await context.module.exports.ensureVigem();
  assert.equal(result.ok, false);
  assert.equal(spawned, false);
  assert.match(prompt.message, /ViGEmBus.*controller/i);
  assert.equal(prompt.buttons[0], 'Install Controller Driver');
});
