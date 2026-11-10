'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const WebSocket=require('ws');
const {createServer}=require('../../server/index.js');
const {create}=require('../../src/network/match-authority.js');

test('real room clock catches up bounded ticks after slow async simulation replies', {timeout:10000}, async()=>{
  let elapsed=0;
  const authority=create({unit:()=>null,building:()=>null,world:()=>({width:1000,height:1000}),apply:()=>true,
    step:dt=>{elapsed+=dt;},snapshotFor:()=>({elapsed,units:[],buildings:[],groups:[],resources:[],gameOver:false})});
  for(const side of ['france','britain'])authority.addPlayer(side,side);
  const host={create:async()=>({close:async()=>{},advance:async(commands,running,snapshot,seconds=.05)=>{
    if(running)authority.advance(seconds);
    const result={receipts:[],...(snapshot?{views:{france:authority.snapshotFor('france'),britain:authority.snapshotFor('britain')}}:{})};
    // Model the async browser/IPC boundary, not a slow physics implementation.
    await new Promise(resolve=>setTimeout(resolve,160));return result;
  }}),close:async()=>{}};
  const app=await createServer({port:0,bind:'127.0.0.1',simulationHost:host}),clients=[];
  const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`,origin=`http://127.0.0.1:${app.address.port}`;
  const ticks=[];
  function connect(message){return new Promise((resolve,reject)=>{
    const ws=new WebSocket(endpoint,{origin});clients.push(ws);ws.on('error',reject);
    ws.on('open',()=>ws.send(JSON.stringify({...message,protocol:1})));
    ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='welcome'){ws.send(JSON.stringify({type:'ready'}));resolve(m);}
      if(m.type==='snapshot'||m.type==='delta')ticks.push(m.view.tick);
      if(m.type==='error')reject(Error(m.reason));});
  });}
  try{
    const a=await connect({type:'create'});await connect({type:'join',room:a.room});
    const deadline=Date.now()+5000;
    while(Date.now()<deadline&&!ticks.some((tick,i)=>i>0&&tick-ticks[i-1]>2))await new Promise(resolve=>setTimeout(resolve,50));
    // Replies take >3 tick intervals. Dropping busy callbacks used to advance
    // only one tick per request (and two between snapshots), slowing the game.
    assert.ok(ticks.some((tick,i)=>i>0&&tick-ticks[i-1]>2),`Lost elapsed time: ${ticks}`);
    assert.ok(ticks.every((tick,i)=>i===0||tick-ticks[i-1]<=5),'Catch-up must stay capped at 250 ms');
  }finally{for(const ws of clients)ws.terminate();await app.close();}
});
