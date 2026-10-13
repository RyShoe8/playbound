import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createProcessMetrics} from './processMetrics.js';

function fixture() {
  const state = {time:0,node:1000,ticks:100,started:42,alive:true};
  const fileSystem = {
    readdirSync:()=>['123'],
    readFileSync(file) {
      if (!state.alive) throw Error('Exited');
      if (file==='/proc/stat') return `cpu ${state.node} 0 0 0 0 0 0 0\n`;
      if (file.endsWith('/status')) return 'VmRSS: 1024 kB\n';
      const fields=Array(22).fill('0');
      fields[0]='S';fields[2]='123';fields[11]=String(state.ticks);fields[19]=String(state.started);
      return `123 (server) ${fields.join(' ')}`;
    },
  };
  return {state,measure:createProcessMetrics({fileSystem,coreCount:()=>6,now:()=>state.time})};
}

test('rapid consumers share a stable CPU sample instead of quantized spikes',()=>{
  const {state,measure}=fixture();
  assert.equal(measure(123).cpuCores,null);
  Object.assign(state,{time:1500,node:1900,ticks:250});
  const stable=measure(123);
  assert.equal(stable.cpuCores,1);
  for(let i=0;i<20;i++){
    state.time+=1;state.node+=1;state.ticks+=3;
    assert.deepEqual(measure(123),stable);
  }
  Object.assign(state,{time:3000,node:2800,ticks:400});
  assert.equal(measure(123).cpuCores,1);
});

test('PID reuse and process exit invalidate cached readings',()=>{
  const {state,measure}=fixture();
  measure(123);
  Object.assign(state,{time:1500,node:1900,ticks:250});
  assert.equal(measure(123).cpuCores,1);
  state.started=43;state.ticks=0;state.time+=1;
  assert.equal(measure(123).cpuCores,null);
  state.alive=false;
  assert.deepEqual(measure(123),{available:false});
});

test('impossible process-group tick deltas are unknown instead of inflated CPU',()=>{
  const {state,measure}=fixture();
  measure(123);
  Object.assign(state,{time:1000,node:1600,ticks:1500});
  assert.equal(measure(123).cpuCores,null);
  Object.assign(state,{time:2000,node:2200,ticks:1600});
  assert.equal(measure(123).cpuCores,1);
});
