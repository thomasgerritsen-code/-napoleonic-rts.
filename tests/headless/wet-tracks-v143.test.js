'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(capacity=2600){const s=createSandbox({window:{NRTS_CONFIG:{weather:{}}}});loadProductionScript(s.context,'src/systems/rendering/wet-tracks-v1.js');return s.window.__WET_TRACKS_V1__.create({capacity,ppm:22.5});}
const unit=(type='infantry',troop)=>({id:1,x:100,y:200,type,troop});
test('boots alternate at distance-spaced steps; standing still creates no marks',()=>{
 const a=setup(),u=unit(),m={};a.sample(u,m,1,0);for(let i=0;i<60;i++)a.sample(u,m,1,i/60);assert.equal(a.stats().count,0);
 for(let i=0;i<6;i++){u.x+=13.5;a.sample(u,m,1,1+i);}
 const marks=a.snapshot();assert.equal(marks.length,6);assert.deepEqual(Array.from(marks,x=>x.step),[1,0,1,0,1,0]);
 assert.ok(marks.every(x=>x.kind==='boot'&&x.direction===0));
 marks.forEach((x,i)=>assert.equal(x.x,100+(i+1)*13.5));assert.equal(u.x,181);
});
test('cavalry and mounted officers leave hooves, foot officers boots, artillery ruts',()=>{
 for(const [type,troop,kind] of [['cavalry',null,'hoof'],['officer','mounted','hoof'],['officer',null,'boot'],['artillery',null,'wheel']]){
  const a=setup(),u=unit(type,troop),m={};a.sample(u,m,1,0);u.y+=50;a.sample(u,m,1,1);
  assert.ok(a.stats().count>0);assert.ok(a.snapshot().every(x=>x.kind===kind&&x.direction===2));
 }
});
test('dry, invisible, bridged or teleported movement is not joined by invented trails',()=>{
 const a=setup(),u=unit(),m={};a.sample(u,m,0,0);u.x+=60;a.sample(u,m,0,1);a.sample(u,m,1,2);assert.equal(a.stats().count,0);
 u.x+=100;a.sample(u,m,1,3,false);a.sample(u,m,1,4);assert.equal(a.stats().count,0);
 u.x+=1000;a.sample(u,m,1,5);assert.equal(a.stats().count,0);
 u.x+=13.5;a.sample(u,m,1,6);assert.equal(a.stats().count,1);assert.equal(a.snapshot()[0].x,u.x);
});
test('long frames have a per-unit limit; the ring keeps its newest marks in order',()=>{
 const a=setup(8),u=unit(),m={};a.sample(u,m,1,0);u.x+=170;a.sample(u,m,1,1);assert.equal(a.stats().count,4);
 for(let i=0;i<20;i++){u.x+=13.5;a.sample(u,m,1,2+i);}
 const marks=a.snapshot();assert.equal(marks.length,8);assert.equal(a.stats().emitted,24);assert.equal(a.stats().boot,8);
 assert.ok(marks.every((x,i)=>!i||x.x>marks[i-1].x));assert.equal(marks.at(-1).x,u.x);
});
test('old tracks expire without new traffic and reset releases every old mark',()=>{
 const a=setup(),u=unit(),m={};a.sample(u,m,1,0);u.x+=27;a.sample(u,m,1,1);assert.equal(a.stats().count,2);
 a.prune(100,1);assert.equal(a.stats().count,2);a.prune(100,0);assert.equal(a.stats().count,0);
 u.x+=27;a.sample(u,m,1,101);a.reset();assert.equal(a.stats().count,0);assert.equal(a.stats().emitted,0);assert.equal(a.stats().boot,0);
});
