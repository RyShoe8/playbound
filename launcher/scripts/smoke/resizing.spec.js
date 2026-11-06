const {test,expect,_electron} = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const signedOut of [false,true]) {
  test(`launcher panels fit resized windows (${signedOut ? 'signed out' : 'signed in'})`,async ({},testInfo) => {
    test.setTimeout(120000);
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'playbound-resize-'));
    let application;
    try {
      const env = {...process.env,PLAYBOUND_SMOKE_ROOT:root,PLAYBOUND_SMOKE_SIGNED_OUT:signedOut ? '1' : '0'};
      delete env.ELECTRON_RUN_AS_NODE;
      const args = [path.join(__dirname,'entry.js')];
      if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
      application = await _electron.launch({args,env});
      const page = await application.firstWindow();
      await expect(page.locator('#site-account-name')).toHaveText(signedOut ? 'Sign in to PlayBound' : 'Smoke User');
      for (const width of [1440,1200,1024,900]) {
        await page.setViewportSize({width,height:600});
        for (const view of ['home','games','multiplayer','friends','events','deals','library','couch','settings']) {
          if (view === 'settings') await page.locator('.site-account-menu summary').click();
          await page.locator(`#sidebar [data-view="${view}"]`).click();
          if (view === 'settings') await page.locator('.site-account-menu summary').click();
          await expect(page.locator(`#view-${view}`)).toHaveClass(/active/);
          if (view === 'multiplayer') {
            await expect(page.locator('#view-multiplayer .server-table tbody tr')).toHaveCount(1);
            const bounds = await page.evaluate(() => {
              const server = document.querySelector('#view-multiplayer #mp-overview-servers-sec').getBoundingClientRect();
              const parties = document.querySelector('#view-multiplayer .site-multiplayer-main').getBoundingClientRect();
              const wrapper = document.querySelector('#view-multiplayer #servers-table-wrap');
              return {overlap:server.left < parties.right && parties.left < server.right && server.top < parties.bottom && parties.top < server.bottom,
                contained:wrapper.getBoundingClientRect().right <= server.right+1,
                scrollable:getComputedStyle(wrapper).overflowX === 'auto'};
            });
            expect(bounds,{width,view}).toEqual({overlap:false,contained:true,scrollable:true});
            expect(await page.locator('#view-multiplayer .server-table thead').evaluate(el => el.getBoundingClientRect().height)).toBeLessThan(55);
            if (!signedOut) {
              await page.locator('#view-multiplayer #servers-table-wrap').scrollIntoViewIfNeeded();
              await page.screenshot({path:testInfo.outputPath(`multiplayer-${width}.png`)});
            }
          }
          // This catches overflow inside the scrolling content, even when the
          // outer window clips it and document.scrollWidth looks correct.
          await expect.poll(() => page.locator('#content').evaluate(el => el.scrollWidth-el.clientWidth),{message:`${view} at ${width}px`}).toBeLessThanOrEqual(1);
        }
        for (const id of ['site-my-servers','site-developer']) {
          await page.locator(`#${id}`).click();
          await expect.poll(() => page.locator('#content').evaluate(el => el.scrollWidth-el.clientWidth),{message:`${id} at ${width}px`}).toBeLessThanOrEqual(1);
        }
        await page.locator('#sidebar [data-view="games"]').click();
        await page.locator('#view-games .card-title-text').filter({hasText:'Smoke Fixture Game'}).first().click();
        await expect(page.locator('#act-install')).toBeVisible();
        await expect.poll(() => page.locator('#content').evaluate(el => el.scrollWidth-el.clientWidth),{message:`game detail at ${width}px`}).toBeLessThanOrEqual(1);
      }
    } finally {
      if (application) await application.close();
      fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  });
}

test('Friend Size switches on drag, opens friends, and restores a full launcher', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'playbound-friend-size-'));
  const env = { ...process.env, PLAYBOUND_SMOKE_ROOT: root };
  delete env.ELECTRON_RUN_AS_NODE;
  let app;
  try {
    const args = [path.join(__dirname,'entry.js')];
    if (process.platform === 'linux' && process.env.CI) args.push('--no-sandbox');
    app = await _electron.launch({ args, env });
    const page = await app.firstWindow();
    await expect(page.locator('#site-account-name')).toHaveText('Smoke User');
    const companionOpened = app.waitForEvent('window', { predicate: p => p !== page });
    await page.locator('#friend-size-toggle').click();
    const companion = await companionOpened;
    await expect(companion.locator('[data-tab="friends"]')).toHaveClass(/active/);
    await companion.locator('[data-tab="controls"]').click();
    await expect(companion.locator('[data-tab="controls"]')).toHaveClass(/active/);
    await companion.locator('[data-tab="friends"]').click();

    // The same panel as the website's homepage, working inside Friend View.
    const mainWindow = fn => app.evaluate(({BrowserWindow}, source) => {
      const main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('renderer/index.html') || w.webContents.getURL().includes('renderer\\index.html'));
      return new Function('main', `return (${source})(main)`)(main);
    }, fn.toString());
    const friendView = () => app.evaluate(({BrowserWindow}) => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('overlay.html')).isVisible());
    await expect(companion.getByRole('button', { name: 'Free to Play Now' })).toBeVisible();
    await expect(companion.locator('.pt-chip', { hasText: 'Smoke Friend' })).toBeVisible();
    await companion.getByRole('button', { name: 'Invite', exact: true }).click();
    await expect(companion.getByRole('status')).toHaveText('Invitation sent to Smoke Friend.');
    await companion.getByRole('button', { name: 'Free to Play Now' }).click();
    await expect(companion.getByRole('status')).toHaveText('Availability shared for two hours.');
    await companion.getByRole('button', { name: 'Edit' }).click();
    await companion.getByRole('button', { name: 'Save preferences' }).click();
    await expect(companion.getByRole('status')).toHaveText('Preferences saved.');
    // Other tabs must not lose what the panel is showing.
    await companion.locator('[data-tab="controls"]').click();
    await companion.locator('[data-tab="friends"]').click();
    await expect(companion.getByRole('status')).toHaveText('Preferences saved.');

    // Friend View hides the big launcher, and its button brings it back.
    await expect.poll(() => mainWindow(main => main.isVisible())).toBe(false);
    await companion.getByRole('button', { name: /Full launcher/ }).click();
    await expect.poll(() => mainWindow(main => main.isVisible())).toBe(true);
    await expect.poll(() => friendView()).toBe(false);

    // The home sidebar has the same panel.
    await page.locator('#sidebar [data-view="home"]').click();
    await expect(page.locator('#home-availability').getByRole('button', { name: 'Free to Play Now' })).toBeVisible();

    // Dragging narrow waits for the mouse to be released, then swaps windows and restores the size.
    const fullBounds = await mainWindow(main => main.getBounds());
    await mainWindow(main => { main.emit('will-resize'); main.setSize(420, 700); });
    await page.waitForTimeout(300);
    expect(await mainWindow(main => main.isVisible())).toBe(true);
    await mainWindow(main => { main.emit('resized'); });
    await expect.poll(() => mainWindow(main => main.isVisible())).toBe(false);
    await expect.poll(() => friendView()).toBe(true);
    await expect(companion.locator('[data-tab="friends"]')).toHaveClass(/active/);
    await companion.getByRole('button', { name: /Full launcher/ }).click();
    await expect.poll(() => mainWindow(main => main.isVisible())).toBe(true);
    expect((await mainWindow(main => main.getBounds())).width).toBe(fullBounds.width);

    // A resize that is not a drag, such as a snap, still switches.
    await mainWindow(main => { main.setSize(420, 700); });
    await expect.poll(() => mainWindow(main => main.isVisible())).toBe(false);
  } finally {
    if (app) await app.close();
    fs.rmSync(root,{ recursive:true, force:true, maxRetries:5 });
  }
});
