const { spawnSync } = require('node:child_process');
const path = require('node:path');

const args = [require.resolve('@playwright/test/cli'), 'test'];
const headlessLinux = process.platform === 'linux' && !process.env.DISPLAY;
const result = spawnSync(headlessLinux ? 'xvfb-run' : process.execPath,
  headlessLinux ? ['-a', process.execPath, ...args] : args, {
    cwd: path.join(__dirname, '..'), stdio: 'inherit', windowsHide: true,
  });
if (result.error) {
  console.error('Launcher smoke test could not start:', result.error.message);
  if (headlessLinux) console.error('Install xvfb and the Electron system libraries.');
}
process.exit(result.status ?? 1);
