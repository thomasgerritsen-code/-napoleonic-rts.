'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(){
 let now=0,reset;
 const s=createSandbox({globals:{performance:{now:()=>now}},window:{NRTS:{events:{on:(name,fn)=>{reset=fn;}}}}});
 loadProductionScript(s.context,'src/systems/performance/frame-work-v1.js');
 return{api:s.window.__FRAME_WORK_V1__,time:t=>{now=t;},reset:()=>reset()};
}
test('background work yields to rendering, meets bounded deadlines and runs one job per frame',()=>{
 const s=setup(),ran=[];
 s.api.enqueue('ai:develop',()=>ran.push('develop'),{maxDelayMs:120});
 s.api.enqueue('ai:orders',()=>ran.push('orders'),{maxDelayMs:80});
 s.time(30);s.api.flush(0);assert.deepEqual(ran,[]);
 s.time(90);s.api.flush(0);assert.deepEqual(ran,['orders']);assert.equal(s.api.stats().pending,1);
 s.time(125);s.api.flush(0);assert.deepEqual(ran,['orders','develop']);
});
test('repeated work is coalesced and resetting cancels old AI without losing asset jobs',()=>{
 const s=setup(),ran=[];
 s.api.enqueue('ai:develop',()=>ran.push('old'));
 s.api.enqueue('ai:develop',()=>ran.push('new'));
 s.api.enqueue('assets:0',()=>ran.push('asset'));
 assert.equal(s.api.stats().pending,2);s.reset();assert.deepEqual([...s.api.stats().keys],['assets:0']);
 s.api.flush(0);assert.deepEqual(ran,['asset']);
});
