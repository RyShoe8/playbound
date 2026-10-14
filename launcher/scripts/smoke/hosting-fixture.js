const ID = '0123456789abcdef01234567';
const BASE = `/api/hosting/servers/${ID}`;
function createHostingFixture(root) {
  const fs = require('node:fs');
  const path = require('node:path');
  const moderator = process.env.PLAYBOUND_SMOKE_HOSTING === 'moderator';
  const permissions = (moderator ? ['view','change_map','kick_players','ban_players'] : ['view','configure','start','stop','restart','change_map','kick_players','ban_players','console','create_backup','restore_backup','manage_access','delete']).map(p => `server:${p}`);
  const server = { id:ID,name:'Fixture Clubhouse',gameTitle:'Xonotic',description:'A server for friends',visibility:'unlisted',slots:16,players:2,online:true,host:'127.0.0.1',port:26000,runtimeState:'running' };
  const control = { role:moderator ? 'moderator' : 'owner',permissions,maps:true,capabilities:{players:true,console:true,liveApply:true},status:{status:'running',host:server.host,port:server.port,resources:{cpuCores:0.1,rssBytes:256*1024**2,collectedAt:new Date().toISOString()}},definitions:[{key:'bots',label:'Bot fill target',feature:'bots',type:'number',min:0,max:16,default:0,apply:'live'}],values:{bots:0} };
  const maintenance = {enabled:false,hourUTC:6,lastDay:null,result:null};
  return (_event,input) => {
    const method = input.method || 'GET', route = input.path;
    if (method !== 'GET') fs.appendFileSync(path.join(root,'hosting-writes.jsonl'),JSON.stringify(input)+'\n');
    if (route === '/api/hosting/me') return {subscription:null,servers:[server],shared:[]};
    if (route === BASE) {
      if (method === 'PATCH') Object.assign(server,input.body);
      return {server,control};
    }
    if (route === `${BASE}/maintenance`) { if (method === 'PUT') Object.assign(maintenance,input.body); return maintenance; }
    if (route === `${BASE}/settings`) { Object.assign(control.values,input.body.settings); return {outcome:'applied-live',rejected:[]}; }
    if (route === `${BASE}/console`) return input.body.command === 'fail' ? {error:'Fixture command rejected'} : {output:'<script>Never execute output</script>'};
    if (route === `${BASE}/players`) return {players:[{id:'7',name:'Fixture Player',pingMs:42}]};
    if (route === `${BASE}/bans`) return {bans:[]};
    if (route === `${BASE}/maps`) return {options:[{value:'stormkeep',label:'Stormkeep'}],current:'stormkeep',mode:'live',canNext:true,canRotate:true,rotation:['stormkeep']};
    if (route === `${BASE}/backups`) return {retention:3,backups:[{id:'backup1',kind:'manual',label:'Before game night',at:new Date().toISOString(),summary:'Saved configuration'}]};
    if (route === `${BASE}/world-backups`) return {supported:false,backups:[]};
    if (route === `${BASE}/access`) return {people:[{userId:'owner',username:'Smoke User',role:'owner'}]};
    if (route === `${BASE}/activity`) return {activity:[{id:'activity',actor:'Smoke User',action:'server_started',at:new Date().toISOString()}]};
    return {ok:true};
  };
}
module.exports = {createHostingFixture};
