const {test,expect,_electron} = require('@playwright/test');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
test('native file browser edits with a version check and shows recoverable history',async ({},testInfo) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'playbound-files-smoke-'));
  let application;
  try {
    const env = {...process.env,PLAYBOUND_SMOKE_ROOT:root,PLAYBOUND_SMOKE_HOSTING:'owner',PLAYBOUND_SMOKE_FILES:'1'};
    delete env.ELECTRON_RUN_AS_NODE;
    application = await _electron.launch({args:[path.join(__dirname,'entry.js')],env});
    const page = await application.firstWindow();
    await expect(page.locator('#site-account-name')).toHaveText('Smoke User');
    await page.locator('#site-my-servers').click();
    await page.getByRole('button',{name:'Manage server',exact:true}).click();
    await page.locator('.workspace-manager-tabs').getByRole('button',{name:'Files',exact:true}).click();
    const pane = page.locator('[data-file-manager]');
    await pane.getByRole('button',{name:'world.json',exact:true}).click();
    await expect(pane.locator('[data-editor]')).toHaveValue('{"day":1}');
    await pane.locator('[data-editor]').fill('{"day":2}');
    await pane.getByRole('button',{name:'Save file',exact:true}).click();
    await expect(pane.getByRole('status')).toContainText('previous version');
    const writes = fs.readFileSync(path.join(root,'hosting-writes.jsonl'),'utf8').trim().split('\n').map(JSON.parse);
    expect(writes.find(item => item.body?.action === 'write').body).toMatchObject({path:'world.json',expectedEtag:'original',contentBase64:Buffer.from('{"day":2}').toString('base64')});
    await pane.getByRole('button',{name:'File history',exact:true}).click();
    await expect(pane.getByRole('button',{name:'Restore file',exact:true})).toBeVisible();
    await page.setViewportSize({width:900,height:700});
    expect(await page.locator('#content').evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await page.screenshot({path:testInfo.outputPath('saved-files.png')});
  } finally {
    if (application) await application.close();
    fs.rmSync(root,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
