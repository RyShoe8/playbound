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
              const rail = document.querySelector('#view-multiplayer .site-multiplayer-rail').getBoundingClientRect();
              const wrapper = document.querySelector('#view-multiplayer #servers-table-wrap');
              return {overlap:server.left < rail.right && rail.left < server.right && server.top < rail.bottom && rail.top < server.bottom,
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
