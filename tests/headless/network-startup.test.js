'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const WebSocket=require('ws');
const {createServer}=require('../../server/index.js');

test('idle sockets expire while accepted cold match creation can finish after the join deadline',{timeout:5000},async()=>{
  const host={create:async()=>{await new Promise(resolve=>setTimeout(resolve,350));return {advance:async()=>({receipts:[]}),close:async()=>{}};},close:async()=>{}};
  const app=await createServer({port:0,bind:'127.0.0.1',joinTimeoutMs:150,simulationHost:host});
  const clients=[];
  function connect(){const ws=new WebSocket(`ws://127.0.0.1:${app.address.port}/multiplayer`,{origin:`http://127.0.0.1:${app.address.port}`});clients.push(ws);return ws;}
  try{
    const idle=connect();
    const idleClosed=new Promise((resolve,reject)=>{idle.on('close',(code,reason)=>resolve({code,reason:reason.toString()}));idle.on('error',reject);});
    const active=connect();
    const welcomed=new Promise((resolve,reject)=>{
      active.on('open',()=>active.send(JSON.stringify({type:'create',protocol:1})));
      active.on('error',reject);
      active.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome')resolve(m);if(m.type==='error')reject(Error(m.reason));});
      active.on('close',()=>reject(Error('Match creation was cut off by the idle deadline')));
    });
    assert.deepEqual(await idleClosed,{code:1008,reason:'Join timeout'});
    const welcome=await welcomed;
    assert.equal(welcome.side,'france');assert.equal(app.rooms.size,1);
    await app.closeRoom(welcome.room);assert.equal(app.rooms.size,0);
  }finally{for(const ws of clients)ws.terminate();await app.close();}
});
