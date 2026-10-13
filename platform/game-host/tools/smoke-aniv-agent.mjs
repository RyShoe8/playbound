import {spawn} from 'node:child_process';import fs from 'node:fs';import crypto from 'node:crypto';
if (process.getuid?.() !== 0) throw Error('Run this isolated Linux smoke test as root');
const root='/var/lib/playbound-host/aniv-agent-staging';const secret=crypto.randomBytes(24).toString('hex');const env={...process.env,HOME:root,GAME_HOST_SECRET:secret,GAME_HOST_PORT:'8743',GAME_HOST_BIND_ADDRESS:'127.0.0.1',GAME_HOST_PUBLIC_IP:'127.0.0.1',GAME_HOST_STATE_DIR:root+'/state',GAME_HOST_MANAGED_LOG_DIR:root+'/logs',GAME_HOST_GAMES_DIR:root+'/games'};let agent;let room;const id='aniv-staging-20261013';
const api=async(p,method='GET',body)=>{let r=await fetch('http://127.0.0.1:8743'+p,{method,headers:{authorization:'Bearer '+secret,'content-type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});let d=await r.json();if(!r.ok)throw Error(JSON.stringify(d));return d};
async function start(){let fd=fs.openSync(root+'/agent.log','a');agent=spawn('node',[root+'/game-host/index.js'],{env,uid:fs.statSync(root).uid,gid:fs.statSync(root).gid,stdio:['ignore',fd,fd]});fs.closeSync(fd);for(let i=0;i<100;i++){try{await api('/managed');return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('Agent failed to start');}
async function shutdown(){if(!agent)return;if(agent.exitCode!==null||agent.signalCode!==null){agent=null;return;}let a=agent;await new Promise(r=>{a.once('exit',r);a.kill('SIGTERM')});agent=null;}
try {
 await start();
 await api('/managed','POST',{communityServerId:id,gameSlug:'aneurism-iv',settings:{maxPlayers:4,map:'aneurismiv'},name:'PlayBound isolated lifecycle test'});
 for(let i=0;i<240;i++) { const state=await api('/managed');room=state.rooms.find(r=>r.communityServerId===id); if(i===1 && room && room.status!=='running'){const startingPid=room.pid;await shutdown();await start();const starting=(await api('/managed')).rooms.find(r=>r.communityServerId===id);if(starting?.pid!==startingPid)throw Error('Loading server was not reattached');console.log('RECOVERED loading supervisor PID',startingPid);}if(room && room.status === 'running')break;if(state.jobs[id]?.status==='failed')throw Error(state.jobs[id].error); if(i%15===0)console.log('Waiting for authenticated Steam and map readiness:',i,'seconds'); await new Promise(r=>setTimeout(r,1000)); }
 if(!room || room.status !== 'running')throw Error('ANEURISM did not become ready');
 if(room.host!==null||room.port!==null||room.join?.kind!=='steam'||!/^\d{17}$/.test(room.join.serverId))throw Error('Expected Steam join metadata, never a fake direct-connect address');
 console.log('READY',JSON.stringify(room));
 const cryptoModule=await import('node:crypto'); const digest=cryptoModule.createHash('sha256').update(id).digest('hex').slice(0,24);
 const statusPath='/var/lib/playbound-host/aneurism-iv-servers/pb-'+digest+'/aniv-status.json'; const native=JSON.parse(fs.readFileSync(statusPath));
 if(!room.resources?.available||room.resources.rssBytes<100000000)throw Error('Native game process metrics unavailable');
 await shutdown();await start();
 const recovered=(await api('/managed')).rooms.find(r=>r.communityServerId===id);
 if(recovered?.pid!==room.pid)throw Error('Supervisor was not reattached');
 const after=JSON.parse(fs.readFileSync(statusPath)); if(after.gamePid!==native.gamePid)throw Error('Native server process was replaced');
 console.log('RECOVERED same supervisor and native PID',room.pid,native.gamePid);
 const second='aniv-staging-other';
 await api('/managed','POST',{communityServerId:second,gameSlug:'aneurism-iv',settings:{maxPlayers:4},name:'Token lease rejection test'});
 for(let i=0;i<60;i++){let state=await api('/managed');if(state.jobs[second]?.status==='running')throw Error('Second server reused the active Steam token');if(state.jobs[second]?.status==='failed'){console.log('SECOND TOKEN LEASE REJECTED');break;}if(i===59)throw Error('Second provisioning did not fail within bounds');await new Promise(r=>setTimeout(r,1000));}
 if(!(await api('/managed')).rooms.some(r=>r.communityServerId===id&&r.pid===room.pid))throw Error('Token rejection affected the running server');
 console.log('STOP',await api('/managed/'+id,'DELETE'));
 for(const pid of [room.pid,native.gamePid]){try{process.kill(pid,0);throw Error('Process still alive: '+pid);}catch(error){if(error.code!=='ESRCH')throw error;}}
 const {execFileSync}=await import('node:child_process');if(execFileSync('ip',['netns','list'],{encoding:'utf8'}).includes(native.namespace))throw Error('Network namespace remained after stop');
  await api('/managed','POST',{communityServerId:'aniv-cancel-staging',gameSlug:'aneurism-iv',settings:{maxPlayers:4},name:'Startup cancellation test'});
 for(let i=0;i<30;i++){if((await api('/managed')).rooms.some(r=>r.communityServerId==='aniv-cancel-staging'))break;await new Promise(r=>setTimeout(r,100));}
 await api('/managed/aniv-cancel-staging','DELETE');await new Promise(r=>setTimeout(r,2500));
 if((await api('/managed')).rooms.some(r=>r.communityServerId==='aniv-cancel-staging'))throw Error('Canceled startup recreated its server');
 if(execFileSync('ip',['netns','list'],{encoding:'utf8'}).includes('pb-aniv-'))throw Error('Canceled startup left a namespace');
 console.log('PASS: authenticated start, Steam join metadata, native metrics, same-PID agent recovery, exclusive token lease, clean stop, namespace cleanup, startup cancellation');
} finally {if(agent){try{await api('/managed/aniv-cancel-staging','DELETE')}catch{} try{await api('/managed/aniv-staging-other','DELETE')}catch{} try{await api('/managed/'+id,'DELETE')}catch{} await shutdown();}}