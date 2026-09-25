const { test, expect, _electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('real launcher boots, navigates, and installs/removes a mock game', async ({}, testInfo) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbound-smoke-'));
  const errors = [];
  let application;
  try {
    const env = { ...process.env, PLAYBOUND_SMOKE_ROOT: root };
    delete env.ELECTRON_RUN_AS_NODE;
    const args = [path.join(__dirname, 'entry.js')];
    // Ubuntu CI's AppArmor profile prevents Electron's unprivileged sandbox.
    if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
    application = await _electron.launch({ args, env });
    const log = [];
    application.process().stderr.on('data', data => log.push(data.toString()));
    application.on('window', page => page.on('pageerror', error => errors.push(error.message)));
    const page = await application.firstWindow();
    page.on('console', msg => log.push(`[renderer ${msg.type()}] ${msg.text()}\n`));
    page.on('pageerror', error => errors.push(error.message));
    await application.context().tracing.start({ screenshots: true, snapshots: true });
    try {
      await expect(page.locator('[data-view="home"]')).toHaveClass(/active/);
      await expect(page.locator('.card-title-text').filter({ hasText: 'Smoke Fixture Game' }).first()).toBeVisible();
      await page.locator('[data-view="friends"]').click();
      await expect(page.locator('#friends-content-area')).toBeVisible();
      await expect(page.getByText('Add Friend', { exact: true }).first()).toBeVisible();
      await page.locator('[data-view="games"]').click();
      await page.locator('#view-games .card-title-text').filter({ hasText: 'Smoke Fixture Game' }).first().click();
      await expect(page.locator('#act-install')).toBeVisible();
      await page.locator('#act-install').click();
      await expect(page.locator('#act-play')).toBeVisible();
      expect(fs.readFileSync(path.join(root, 'mock-installed.txt'), 'utf8')).toBe('smoke-fixture');
      await page.locator('#act-uninstall').click();
      await expect(page.locator('#act-install')).toBeVisible();
      expect(fs.existsSync(path.join(root, 'mock-installed.txt'))).toBe(false);
      expect(errors).toEqual([]);
      expect(fs.existsSync(path.join(root, 'runtime-errors.log'))).toBe(false);
      expect(fs.existsSync(path.join(root, 'last-crash.json'))).toBe(false);
    } finally {
      log.push(JSON.stringify(await page.evaluate(async () => {
        const { state, views } = await import('./shared.js');
        return { view: state.currentView, catalog: state.catalogCache, home: views.home?.outerHTML, context: state.deepLinkCtx };
      })));
      fs.writeFileSync(testInfo.outputPath('electron.log'), log.join('') + '\nErrors: ' + JSON.stringify(errors));
      await testInfo.attach('renderer-errors', { body: JSON.stringify(errors), contentType: 'application/json' });
      await page.screenshot({ path: testInfo.outputPath('launcher.png') });
      await application.context().tracing.stop({ path: testInfo.outputPath('trace.zip') });
      await testInfo.attach('electron-stderr', { body: log.join(''), contentType: 'text/plain' });
    }
  } finally {
    if (application) await application.close();
    // Only remove the directory this test created, after Electron releases it.
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});
