'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createClock}=require('../../server/match-clock.js');
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
  for(let i=0;i<8;i++)caught+=clock.take(20000);
  assert.equal(caught,1);
  assert.equal(clock.take(19900),0);
});
