'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const protocol = require('../../src/network/command-protocol.js');
const {create} = require('../../src/network/match-authority.js');
const command = (seq, unitIds=[1], data={x:200,y:300}) => ({v:1, seq, type:'move', unitIds, buildingId:null, data});
function match() {
  const units = [{id:1,side:'france',x:10,y:10}, {id:2,side:'britain',x:900,y:900}];
  const applied = [], steps = [];
  const adapter = {unit:id => units.find(u => u.id === id), building:() => null, world:() => ({width:1000,height:1000}),
    apply:(side,c) => {applied.push({side,...c}); units.find(u => u.id === c.unitIds[0]).x=c.data.x;},
    step:dt => steps.push(dt), snapshotFor:side => ({units:units.filter(u => u.side === side).map(u => ({...u}))})};
  const authority = create(adapter); authority.addPlayer('alice','france'); authority.addPlayer('bob','britain');
  return {authority, units, applied, steps};
}
test('two clients use one authoritative clock, ordered commands and filtered snapshots', () => {
  const {authority:a,applied,steps} = match();
  assert.deepEqual(a.submit('alice',command(1)),{ok:true,seq:1,tick:1});
  assert.equal(a.submit('bob',command(1,[2],{x:800,y:700})).ok,true);
  assert.equal(applied.length,0);
  assert.equal(a.advance(.1),2); assert.deepEqual(steps,[.05,.05]);
  assert.deepEqual(applied.map(c => c.side),['france','britain']);
  const alice=a.snapshotFor('alice'),bob=a.snapshotFor('bob');
  assert.equal(alice.tick,bob.tick); assert.equal(alice.state.units[0].x,200); assert.equal(bob.state.units[0].x,800);
  assert.equal(alice.state.units.length,1); assert.equal(alice.state.units[0].side,'france');
  assert.equal(alice.acknowledgements.length,1); assert.equal(bob.acknowledgements.length,1);
  assert.equal(a.snapshotFor('outsider'),null);
});
test('ownership, identity, replays and payload forgery are rejected before simulation', () => {
  const {authority:a,applied} = match();
  assert.equal(a.submit('outsider',command(1)).reason,'unknown-player');
  assert.equal(a.submit('alice',{...command(1,[2]),side:'britain'}).reason,'unit-not-owned');
  assert.equal(a.submit('alice',command(1,[1],{x:Infinity,y:0})).ok,false);
  assert.equal(a.submit('alice',command(1,[1],{x:200,y:100,facing:1e308})).ok,false);
  assert.equal(a.submit('alice',command(1,[1],{x:1001,y:0})).reason,'outside-world');
  assert.equal(a.submit('alice',command(1,[1,1])).ok,false);
  assert.equal(a.submit('alice',{...command(1),type:'__proto__'}).ok,false);
  assert.equal(a.submit('alice',{...command(1),type:'give-resources'}).ok,false);
  assert.equal(a.submit('alice',command(1)).ok,true);
  assert.equal(a.submit('alice',command(1)).reason,'stale-sequence');
  a.step(); assert.equal(applied.length,1);
});
test('ownership is checked again on execution; queues and acknowledgements stay bounded', () => {
  const {authority:a,units,applied} = match();
  assert.equal(a.submit('alice',command(1)).ok,true); units[0].dead=true;
  a.step(); assert.equal(applied.length,0); assert.equal(a.snapshotFor('alice').acknowledgements[0].reason,'unit-not-owned');
  units[0].dead=false;
  for(let seq=2;seq<100;seq++)a.submit('alice',command(seq));
  assert.equal(a.stats().pending,39); assert.equal(a.submit('alice',command(101)).reason,'rate-limit');
  assert.equal(a.advance(60),5); assert.equal(a.stats().pending,0);
  assert.equal(a.addPlayer('mallory','france'),false);
});
test('normalization copies untrusted payloads and never accepts client economies or tick authority', () => {
  const raw=command(1);raw.tick=10000;raw.food=100000;raw.data.hp=999;
  const normalized=protocol.normalize(raw).command; raw.unitIds[0]=2;raw.data.x=999;
  assert.equal(normalized.unitIds[0],1);assert.equal(normalized.data.x,200);assert.equal(normalized.tick,undefined);
  assert.deepEqual(Object.keys(normalized.data),['x','y']);assert.ok(Object.isFrozen(normalized.unitIds));
});
test('fixed-tick remainders survive repeated maximum-size batches without losing simulation time',()=>{
  const {authority:a,steps}=match();
  for(let i=0;i<100;i++){a.advance(.24);a.advance(.25);}
  assert.equal(a.stats().tick,980);
  assert.ok(Math.abs(steps.reduce((sum,dt)=>sum+dt,0)-49)<1e-8);
  const slow=create({unit:()=>null,building:()=>null,world:()=>({}),apply:()=>true,step:()=>{},snapshotFor:()=>({})},{hz:1});
  for(let i=0;i<4;i++)slow.advance(.25);
  assert.equal(slow.stats().tick,1);
});
