'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createClock}=require('../../server/match-clock.js');
const {create}=require('../../src/network/match-authority.js');
test('room clock retains brief scheduler delays across bounded real simulation batches',()=>{
  const clock=createClock(1000);
  const amounts=[clock.take(1050),clock.take(1450),clock.take(1500),clock.take(1550)];
  assert.deepEqual(amounts,[.05,.25,.2,.05]);
  assert.ok(Math.abs(amounts.reduce((a,b)=>a+b,0)-.55)<1e-10);
  assert.equal(clock.take(1550),0);
});
test('pause resets discard offline time and long stalls cannot create unbounded catch-up',()=>{
  const clock=createClock(0);
  clock.take(50);clock.reset(10000);assert.equal(clock.take(10050),.05);
  let caught=clock.take(20000);
  for(let i=0;i<20;i++)caught+=clock.take(20000);
  assert.equal(caught,4);
  assert.equal(clock.take(19900),0);
});
test('a brief cold-command burst is repaid with actual bounded physics steps once dispatches recover',()=>{
  const clock=createClock(0),steps=[];
  const match=create({unit:()=>null,building:()=>null,world:()=>({}),apply:()=>true,step:dt=>steps.push(dt),snapshotFor:()=>({})});
  function dispatch(now){const seconds=clock.take(now);assert.ok(seconds>=0&&seconds<=.25);match.advance(seconds);}
  dispatch(50);
  for(let i=1;i<=10;i++)dispatch(50+i*400);
  for(let i=1;i<=30;i++)dispatch(4050+i*50);
  assert.equal(match.stats().tick,111);
  assert.ok(Math.abs(steps.reduce((sum,dt)=>sum+dt,0)-5.55)<1e-9);
  assert.equal(clock.take(5550),0);
});
