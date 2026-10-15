const {test,expect,_electron} = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const role of ['owner','moderator']) test(`native hosting workspace (${role})`,async ({},testInfo) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'playbound-hosting-'));
  let application;
  try {
    const env = {...process.env,PLAYBOUND_SMOKE_ROOT:root,PLAYBOUND_SMOKE_HOSTING:role};
    delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({args:[path.join(__dirname,'entry.js')],env});
    const page = await application.firstWindow();
    await expect(page.locator('#site-account-name')).toHaveText('Smoke User');
    await page.locator('#site-my-servers').click();
    await page.getByRole('button',{name:'Manage server',exact:true}).click();
    const host = page.locator('#view-my-servers');
    await expect(host.getByRole('heading',{name:'Fixture Clubhouse'})).toBeVisible();
    await expect(host.getByText('0.10 CPU cores')).toBeVisible();
    const tabs = host.locator('.workspace-manager-tabs');
    for (const name of role === 'owner' ? ['Settings','Maps','Bots','Players','Backups','Maintenance','Access','Activity','Console','Logs'] : ['Maps','Players','Access','Activity']) {
      await tabs.getByRole('button',{name,exact:true}).click();
      await expect(host.locator('[data-content]')).not.toContainText('Loading…');
      await expect(host.locator('[data-message]')).toBeEmpty();
      if (name === 'Backups') {
        await expect(host.getByText('Before game night')).toBeVisible();
        await expect(host.getByRole('button',{name:'Restore setup'})).toBeDisabled();
      }
      if (name === 'Players') await expect(host.getByText('Fixture Player',{exact:false})).toBeVisible();
      if (name === 'Logs') {
        await expect(host.locator('.workspace-console')).toContainText('<script>Never execute captured output</script>');
        await expect(host.locator('.workspace-console script')).toHaveCount(0);
        await host.getByRole('button',{name:'Follow live output',exact:true}).click();
        await expect(host.getByRole('button',{name:'Pause live output',exact:true})).toHaveAttribute('aria-pressed','true');
        await host.getByRole('button',{name:'Pause live output',exact:true}).click();
        await expect(host.getByRole('button',{name:'Follow live output',exact:true})).toHaveAttribute('aria-pressed','false');
      }
      await page.setViewportSize({width:900,height:700});
      expect(await page.locator('#content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    }
    if (role === 'owner') {
      await tabs.getByRole('button',{name:'Bots',exact:true}).click();
      await host.locator('[data-setting="bots"]').fill('4');
      await host.getByRole('button',{name:'Apply changes'}).click();
      await expect(host.locator('[data-message]')).toHaveText('Changes applied.');
      await tabs.getByRole('button',{name:'Maintenance',exact:true}).click();
      await host.locator('[name="enabled"]').check();
      await host.locator('[name="daysUTC"][value="0"]').uncheck();
      await host.locator('[name="daysUTC"][value="6"]').uncheck();
      for (const day of [1,2,3,4,5]) await host.locator(`[name="daysUTC"][value="${day}"]`).uncheck();
      await host.getByRole('button',{name:'Save maintenance'}).click();
      await expect(host.locator('[data-message]')).toHaveText('Select at least one day.');
      for (const day of [1,2,3,4,5]) await host.locator(`[name="daysUTC"][value="${day}"]`).check();
      await host.getByRole('button',{name:'Save maintenance'}).click();
      await expect(host.locator('[data-message]')).toHaveText('Maintenance saved.');
      await host.locator('.premium-select').filter({has:page.locator('select[name="action"]')}).locator('.premium-select-btn').click();
      await host.getByRole('option',{name:'Back up configuration only (keep server state)',exact:true}).click();
      await host.getByRole('button',{name:'Save maintenance'}).click();
      await expect(host.locator('[data-message]')).toHaveText('Maintenance saved.');
      await tabs.getByRole('button',{name:'Console',exact:true}).click();
      await host.locator('[name="command"]').fill('status');
      await host.getByRole('button',{name:'Send command'}).click();
      await expect(host.locator('.workspace-console')).toContainText('<script>Never execute output</script>');
      await expect(host.locator('.workspace-console script')).toHaveCount(0);
      await host.locator('[name="command"]').fill('fail');
      await host.getByRole('button',{name:'Send command'}).click();
      await expect(host.locator('[data-message]')).toHaveText('Fixture command rejected');
      const writes = fs.readFileSync(path.join(root,'hosting-writes.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
      expect(writes.find(w => w.path.endsWith('/settings')).body).toEqual({settings:{bots:4}});
      expect(writes.find(w => w.path.endsWith('/maintenance')).body).toEqual({enabled:true,action:'restart',hourUTC:6,daysUTC:[1,2,3,4,5]});
      expect(writes.filter(w => w.path.endsWith('/maintenance')).at(-1).body.action).toBe('configuration-backup');
      await tabs.getByRole('button',{name:'Overview',exact:true}).click();
      await page.screenshot({path:testInfo.outputPath('hosting-overview.png')});
    } else {
      await expect(tabs.getByRole('button',{name:'Console',exact:true})).toHaveCount(0);
      await expect(tabs.getByRole('button',{name:'Logs',exact:true})).toHaveCount(0);
      await expect(tabs.getByRole('button',{name:'Settings',exact:true})).toHaveCount(0);
      await expect(host.getByRole('button',{name:'Restart',exact:true})).toHaveCount(0);
      expect(fs.existsSync(path.join(root,'hosting-writes.jsonl'))).toBe(false);
    }
  } finally {
    if (application) await application.close();
    fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
