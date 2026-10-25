'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const WebSocket=require('ws');
const {createServer}=require('../../server/index.js');
const {createEncoder}=require('../../server/state-delta.js');
const {playerName}=require('../../server/player-name.js');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,ms=4000){const end=Date.now()+ms;while(Date.now()<end){const value=fn();if(value)return value;await delay(10);}throw Error('Timed out waiting for lobby state');}
function gate(){let release;const promise=new Promise(r=>{release=r;});return{promise,release};}
function fixture(){
 const metrics={created:0,live:0,maxLive:0,closed:[]},matches=[];
 const host={healthy:()=>true,close:async()=>{},create:async()=>{
  const id=++metrics.created;metrics.live++;metrics.maxLive=Math.max(metrics.maxLive,metrics.live);
  const m={id,tick:0,elapsed:0,finished:false,closed:false,block:null,blocked:false,encoders:{}};matches.push(m);
  if(host.creationGate&&id===2)await host.creationGate.promise;
  return{close:async()=>{if(m.closed)throw Error('Simulation closed twice');m.closed=true;metrics.live--;metrics.closed.push(id);},advance:async(commands,running,snapshot,seconds,epochs)=>{
   if(m.closed)throw Error('Advanced a closed simulation');if(running){m.tick++;m.elapsed+=seconds;}
   const packets={};if(snapshot)for(const side of ['france','britain']){const epoch=epochs[side];if(!epoch)continue;if(m.encoders[side]?.epoch!==epoch)m.encoders[side]={epoch,encoder:createEncoder()};const state={elapsed:m.elapsed,gameOver:m.finished,winner:m.finished?'france':null,units:[{id:1,side,hp:100}],buildings:[],groups:[],resources:[],economy:{food:1100},generation:id};packets[side]={epoch,packet:m.encoders[side].encoder.encode({v:1,tick:m.tick,hz:20,side,acknowledgements:[],state})};}
   if(m.block){const b=m.block;m.block=null;m.blocked=true;await b.promise;}
   return{receipts:commands.map(c=>({side:c.side,seq:c.command.seq,ok:true})),...(snapshot?{packets}:{})};
  }};
 }};return{host,metrics,matches};
}
async function setup(){const f=fixture(),app=await createServer({port:0,bind:'127.0.0.1',simulationHost:f.host,maxRooms:1}),clients=[];const endpoint=`ws://127.0.0.1:${app.address.port}/multiplayer`,origin=`http://127.0.0.1:${app.address.port}`;
 async function connect(message){const ws=new WebSocket(endpoint,{origin}),events=[];clients.push(ws);ws.on('message',raw=>events.push(JSON.parse(raw)));await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);});ws.send(JSON.stringify({protocol:1,...message}));const welcome=await until(()=>events.find(m=>m.type==='welcome'));return{ws,events,welcome,send:m=>ws.send(JSON.stringify(m)),wait:predicate=>until(()=>events.find(predicate))};}
 return{...f,app,connect,async close(){for(const m of f.matches)m.block?.release();f.host.creationGate?.release();for(const ws of clients)ws.terminate();await app.close();}};
}
async function pair(s){const a=await s.connect({type:'create',name:'Alice'}),b=await s.connect({type:'join',room:a.welcome.room,name:'Bob'});return{a,b,room:s.app.rooms.get(a.welcome.room)};}
function ready(p,round=1){p.send({type:'loaded',round});p.send({type:'ready',round,value:true});}

test('names are bounded Unicode text with controls removed and safe faction defaults',()=>{
 assert.equal(playerName('\u202e  Anne   Test \u0000','france'),'Anne Test');assert.equal(Array.from(playerName('🐎'.repeat(40),'britain')).length,24);assert.equal(playerName(null,'france'),'Speler 1');assert.equal(playerName('  ','britain'),'Speler 2');assert.equal(playerName('<img src=x onerror=alert(1)>','france'),'<img src=x onerror=alert');
});
test('loaded players wait for explicit readiness; authenticated ping and reconnect preserve names and consent',{timeout:10000},async()=>{
 const s=await setup();try{
  const a=await s.connect({type:'create',name:'\u202e  Anne   Test  '}),b=await s.connect({type:'join',room:a.welcome.room,name:'Bob'}),room=s.app.rooms.get(a.welcome.room);
  assert.equal(a.welcome.name,'Anne Test');a.send({type:'profile',round:1,name:'Anna',side:'britain'});await until(()=>room.players.france.name==='Anna');assert.equal(room.players.britain.name,'Bob');a.send({type:'loaded',round:1});b.send({type:'loaded',round:1});await until(()=>Object.values(room.players).every(p=>p.loaded));assert.equal(room.phase,'waiting');assert.equal(s.matches[0].elapsed,0);
  a.send({type:'ping',nonce:17});assert.deepEqual(await a.wait(m=>m.type==='pong'),{type:'pong',nonce:17});a.send({type:'ping',nonce:'bad'});await a.wait(m=>m.type==='error'&&m.reason==='invalid-message');
  ready(a);await until(()=>room.players.france.ready);a.send({type:'profile',round:1,name:'No rename'});await a.wait(m=>m.type==='error'&&m.reason==='name-locked');assert.equal(room.players.france.name,'Anna');assert.equal(room.phase,'waiting');a.send({type:'ready',round:1,value:false});await until(()=>!room.players.france.ready);assert.equal(room.phase,'waiting');
  ready(a);ready(b);await until(()=>room.phase==='playing');await until(()=>s.matches[0].elapsed>0);
  b.ws.terminate();await until(()=>room.phase==='paused');await until(()=>!room.busy);const elapsed=s.matches[0].elapsed;await delay(100);assert.equal(s.matches[0].elapsed,elapsed);
  const resumed=await s.connect({type:'resume',room:a.welcome.room,token:b.welcome.token,name:'Impostor'});assert.equal(resumed.welcome.name,'Bob');assert.equal(resumed.welcome.confirmed,true);resumed.send({type:'loaded',round:1});await until(()=>room.phase==='playing');
 }finally{await s.close();}
});
test('two rematch votes replace one simulation in the same room, discard in-flight replies and reject old-round commands',{timeout:10000},async()=>{
 const s=await setup();let blocked;try{
  let{a,b,room}=await pair(s);ready(a);ready(b);await until(()=>room.phase==='playing');
  a.send({type:'rematch',round:1});await a.wait(m=>m.type==='error'&&m.reason==='rematch-unavailable');assert.equal(s.metrics.created,1);
  s.matches[0].finished=true;await until(()=>room.phase==='finished');b=await s.connect({type:'resume',room:a.welcome.room,token:b.welcome.token});b.send({type:'loaded',round:1});await until(()=>room.players.britain.loaded);assert.equal(room.phase,'finished');blocked=gate();s.matches[0].block=blocked;await until(()=>s.matches[0].blocked);
  a.send({type:'rematch',round:1});await until(()=>room.players.france.rematch);assert.equal(room.phase,'finished');assert.equal(s.metrics.created,1);
  b.send({type:'rematch',round:1});await until(()=>room.phase==='restarting');assert.equal(s.metrics.created,1);assert.equal(s.metrics.live,1);blocked.release();
  await a.wait(m=>m.type==='new-round'&&m.round===2);await b.wait(m=>m.type==='new-round'&&m.round===2);assert.equal(room.phase,'waiting');assert.equal(s.metrics.maxLive,1);assert.deepEqual(s.metrics.closed,[1]);assert.equal(s.app.rooms.size,1);assert.equal(room.players.france.name,'Alice');assert.equal(room.players.britain.name,'Bob');assert.equal(room.players.france.token,a.welcome.token);
  const fresh=await a.wait(m=>m.type==='snapshot'&&m.round===2);assert.equal(fresh.view.tick,0);assert.equal(fresh.view.state.generation,2);assert.equal(fresh.view.state.elapsed,0);assert.equal(fresh.view.state.gameOver,false);
  const at=a.events.findIndex(m=>m.type==='new-round');assert.ok(a.events.slice(at+1).every(m=>m.round!==1));
  a.send({type:'command',round:1,command:{v:1,seq:999,type:'move',unitIds:[1],buildingId:null,data:{x:200,y:200}}});await a.wait(m=>m.type==='error'&&m.reason==='stale-round');assert.equal(room.commands.length,0);
  a.send({type:'loaded',round:2});b.send({type:'loaded',round:2});await until(()=>Object.values(room.players).every(p=>p.loaded));assert.equal(room.phase,'waiting');ready(a,2);await until(()=>room.players.france.ready);assert.equal(room.phase,'waiting');ready(b,2);await until(()=>room.phase==='playing');
 }finally{blocked?.release();await s.close();}
});
test('leaving during replacement creation disposes the new context and never leaves a second match alive',{timeout:10000},async()=>{
 const s=await setup();try{const{a,b,room}=await pair(s);ready(a);ready(b);await until(()=>room.phase==='playing');s.matches[0].finished=true;await until(()=>room.finished);s.host.creationGate=gate();a.send({type:'rematch',round:1});b.send({type:'rematch',round:1});await until(()=>s.metrics.created===2);assert.equal(s.metrics.maxLive,1);a.send({type:'leave'});await until(()=>s.app.rooms.size===0);s.host.creationGate.release();await until(()=>s.metrics.live===0);assert.deepEqual(s.metrics.closed,[1,2]);}finally{await s.close();}
});
