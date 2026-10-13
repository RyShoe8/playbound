const assert = require('node:assert/strict');
const {test} = require('node:test');
const {createTelemetry} = require('./telemetry');

test('launcher upgrades retain install identity and never report another install',async () => {
  const fetchBefore = global.fetch;
  const sent = [];
  let settings = {};
  let version = '0.3.167';
  let online = false;
  global.fetch = async (_url,init) => {
    if (!online) throw new Error('offline');
    sent.push(JSON.parse(init.body));
    return {ok:true};
  };
  const start = () => createTelemetry({getApiBase:()=> 'https://example.test',loadSettings:()=>({...settings}),saveSettings:next=>{settings=next;},getAppVersion:()=>version});
  try {
    await start().launcherInstalled();
    assert.equal(sent.length,0);
    assert.equal(settings.launcherInstallPendingId,settings.analyticsId);
    online = true;
    await start().launcherInstalled();
    assert.equal(sent.length,1,'offline first launch retries its pending installation');
    version = '0.3.168';
    await start().launcherInstalled();
    assert.equal(sent.length,1,'updating the launcher is not another install');
    settings = {analyticsId:'legacy-existing-install'};
    const result = await start().launcherInstalled();
    assert.equal(result.migrated,true);
    assert.equal(sent.length,1,'legacy upgrades without a receipt are not new installs');
  } finally { global.fetch = fetchBefore; }
});
