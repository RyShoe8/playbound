const { test, expect, _electron } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('signed-out launcher keeps discovery usable and exposes account entry', async ({}, testInfo) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbound-smoke-'));
  let application;
  try {
    const env = {...process.env, PLAYBOUND_SMOKE_ROOT:root, PLAYBOUND_SMOKE_SIGNED_OUT:'1'};
    delete env.ELECTRON_RUN_AS_NODE;
    const args = [path.join(__dirname, 'entry.js')];
    if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
    application = await _electron.launch({args,env});
    const page = await application.firstWindow();
    await expect(page.locator('#site-account-name')).toHaveText('Sign in to PlayBound');
    await expect(page.locator('#home-editions-grid')).toContainText('Could not load this section');
    await page.locator('#home-editions-grid').getByRole('button',{name:'Try again'}).click();
    await expect(page.locator('#home-editions-grid')).toContainText('Fixture Edition');
    await expect(page.locator('#home-mods-grid')).toContainText('Fixture Mod');
    await expect(page.locator('#home-people').getByRole('button',{name:'Sign in',exact:true})).toBeVisible();
    await page.locator('[data-view="games"]').click();
    await expect(page.locator('#games-grid .card-title-text').filter({hasText:'Smoke Fixture Game'})).toBeVisible();
    await page.locator('[data-view="deals"]').click();
    await expect(page.locator('#deals-status')).toContainText('Could not reach PlayBound');
    await page.getByRole('button',{name:'Refresh deals',exact:true}).click();
    await expect(page.locator('#deals-discount-grid')).toContainText('Fixture Deal');
    await page.locator('#deals-genre-chips').getByRole('button', {name:'Strategy',exact:true}).click();
    await expect(page.locator('#deals-genre-chips [data-genre="strategy"]')).toHaveClass(/active/);
    await expect(page.locator('#deals-discount-grid')).toContainText('Fixture Deal');
    await page.locator('#sidebar .site-wordmark').click();
    await expect(page.getByRole('heading',{name:'Find your next game night.'})).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('signed-out-home.png')});
    await page.setViewportSize({width:900,height:700});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('#site-account')).toBeVisible();
    await page.screenshot({path:testInfo.outputPath('compact-home.png')});
  } finally {
    if (application) await application.close();
    fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});

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
      await expect(page.getByRole('heading', { name: 'Good to see you, Smoke User.' })).toBeVisible();
      await expect(page.locator('#home-next-night .site-night-title')).toHaveText('Fixture Game Night');
      await expect(page.locator('#home-next-night .site-night-game')).toHaveText('Smoke Fixture Game');
      await expect(page.locator('#home-next-night .site-night-details')).toHaveText('View details →');
      await expect(page.locator('#home-next-night .site-night-footer')).toContainText('2 going / 8');
      await expect(page.locator('#home-next-night .site-night-description')).toContainText('Bring your friends');
      await page.locator('#home-next-night .site-night-card').screenshot({path:testInfo.outputPath('home-game-night.png')});
      await expect(page.locator('#home-mods-grid')).toContainText('For Smoke Fixture Game');
      await expect(page.locator('.site-wordmark small')).toHaveText('Discover. Play. Connect.');
      await expect(page.locator('#site-account-name')).toHaveText('Smoke User');
      expect(await page.locator('#sidebar').evaluate(element => Math.round(element.getBoundingClientRect().width))).toBe(206);
      await page.screenshot({ path: testInfo.outputPath('home-layout.png') });
      await expect(page.locator('.card-title-text').filter({ hasText: 'Smoke Fixture Game' }).first()).toBeVisible();
      await expect(page.getByRole('heading',{name:'Most Popular this week',exact:true})).toBeVisible();
      await page.locator('[data-view="friends"]').click();
      await expect(page.locator('#friends-content-area')).toBeVisible();
      await expect(page.getByText('Add Friend', { exact: true }).first()).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath('friends-layout.png') });
      await page.locator('[data-view="events"]').click();
      await expect(page.getByRole('heading', {name:'Events & game nights', exact:true})).toBeVisible();
      await expect(page.locator('.site-event-row')).toContainText('Fixture Game Night');
      await page.getByRole('button', {name:'Tournaments',exact:true}).click();
      await expect(page.getByRole('heading',{name:'No events scheduled here yet'})).toBeVisible();
      await page.getByRole('button', {name:'Game nights',exact:true}).click();
      await expect(page.locator('.site-event-row')).toContainText('Fixture Game Night');
      await page.screenshot({ path: testInfo.outputPath('events-layout.png') });
      await page.locator('[data-view="multiplayer"]').click();
      await expect(page.getByRole('heading',{name:'Multiplayer',exact:true})).toBeVisible();
      await expect(page.locator('#mp-hub-stat-grid')).toBeVisible();
      expect(await page.locator('.mp-hub-container').evaluate(element => element.getBoundingClientRect().width > element.parentElement.clientWidth - 80)).toBe(true);
      await page.screenshot({ path: testInfo.outputPath('multiplayer-layout.png') });
      await page.locator('#site-my-servers').click();
      await expect(page.getByRole('heading',{name:'My servers',exact:true})).toBeVisible();
      await expect(page.getByText('No saved servers yet.',{exact:true})).toBeVisible();
      await page.locator('#site-developer').click();
      await expect(page.getByRole('heading',{name:'Developer Dashboard',exact:true})).toBeVisible();
      await expect(page.getByRole('heading',{name:'Your Games',exact:true})).toBeVisible();
      await page.locator('[data-view="deals"]').click();
      await expect(page.locator('#deals-discount-grid')).toContainText('Fixture Deal');
      await expect(page.getByRole('button',{name:'Refresh deals',exact:true})).toBeVisible();
      await page.locator('[data-view="games"]').click();
      await page.screenshot({ path: testInfo.outputPath('games-layout.png') });
      await page.locator('#view-games .card-title-text').filter({ hasText: 'Smoke Fixture Game' }).first().click();
      await expect(page.locator('#act-install')).toBeVisible();
      await expect(page.locator('.site-media-stage')).toBeVisible();
      // Exercise the gallery with local-only artwork; no game download or remote media.
      await page.evaluate(async () => {
        const {mountHeroMedia} = await import('./heroMedia.js');
        const container = document.querySelector('#view-game-detail');
        container.querySelector('.site-hero-media').remove();
        mountHeroMedia(container, {title:'Fixture', screenshots:[
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"/>',
          'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="360" height="640"/>',
        ]}, () => ({}), () => false);
      });
      const before = await page.locator('#act-install').boundingBox();
      await page.getByRole('button',{name:'Image 2',exact:true}).click();
      const after = await page.locator('#act-install').boundingBox();
      expect(after.y).toBe(before.y);
      expect(after.x).toBe(before.x);
      await page.screenshot({ path: testInfo.outputPath('game-detail-layout.png') });
      await page.locator('#act-install').click();
      await expect(page.locator('#act-play')).toBeVisible();
      const gameDir = path.join(root, 'games', 'smoke-fixture');
      const record = () => JSON.parse(fs.readFileSync(path.join(root, 'installed.json'), 'utf8'))['smoke-fixture'];
      expect(fs.existsSync(path.join(gameDir, 'SmokeFixture.exe'))).toBe(true);
      expect(record()).toBeTruthy();
      // The real uninstall: the folder and the library record must both be gone.
      await page.locator('#act-uninstall').click();
      await expect(page.locator('#act-install')).toBeVisible();
      await expect.poll(() => fs.existsSync(gameDir), { timeout: 15000 }).toBe(false);
      expect(record()).toBeUndefined();
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
