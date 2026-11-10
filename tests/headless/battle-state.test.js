'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {create}=require('../../src/systems/scenario/battle-state.js');
const u=(id,side='france',type='infantry')=>({id,side,type,hp:100,dead:false});
const b=(id,side)=>({...u(id,side),type:'towncenter'});
const zones=(side='france')=>({points:[1,2,3].map(id=>({id,owner:side,incomeActive:true,contested:false,claim:null}))});
test('territory victory requires 120 full seconds after capture, is native-side and immutable',()=>{
 const m=create(),units=[u(1),u(2,'britain')],buildings=[b(3,'france'),b(4,'britain')];m.observe(units,buildings,true);
 assert.equal(m.territoryStep(.25,zones('britain'),15),null);
 for(let i=1;i<480;i++)assert.equal(m.territoryStep(.25,zones('britain'),15+i*.25),null);
 const r=m.territoryStep(.25,zones('britain'),135);assert.equal(r.winner,'britain');assert.equal(r.reason,'territories');assert.equal(r.elapsed,135);assert.equal(r.stats.britain.territories,3);
 r.stats.britain.unitsRemaining=999;assert.equal(m.state().result.stats.britain.unitsRemaining,1);
 assert.equal(m.territoryStep(100,zones('france'),999).winner,'britain');assert.equal(m.elimination([],[],1000).winner,'britain');
});
test('contesting, recapture, neutral areas, and switching the owner reset the hold instead of pausing',()=>{
 for(const change of[p=>p.contested=true,p=>p.claim='britain',p=>p.incomeActive=false,p=>p.owner=null,p=>p.owner='britain']){
  const m=create();m.territoryStep(.25,zones(),0);m.territoryStep(90,zones(),90);const challenged=zones();change(challenged.points[0]);m.territoryStep(.25,challenged,90.25);assert.equal(m.state().heldSeconds,0);assert.equal(m.state().controlSide,null);
  m.territoryStep(.25,zones(),91);m.territoryStep(119.75,zones(),210.75);assert.equal(m.state().result,null);
 }
 const m=create();m.territoryStep(.25,zones(),0);m.territoryStep(90,zones(),90);m.territoryStep(.25,zones('britain'),91);assert.equal(m.state().heldSeconds,0);assert.equal(m.state().controlSide,'britain');
});
test('invalid time and fewer than three areas never generate a territorial victory',()=>{
 const m=create();for(const dt of[0,-1,NaN,Infinity])m.territoryStep(dt,zones(),100);assert.equal(m.state().heldSeconds,0);
 m.territoryStep(200,{points:zones().points.slice(0,2)},200);assert.equal(m.state().result,null);
});
test('elimination requires headquarters and all nonworkers; routed living soldiers still count, draw is simultaneous',()=>{
 const m=create(),units=[u(1),u(2,'britain'),u(3,'britain','worker')],buildings=[b(4,'france'),b(5,'britain')];m.observe(units,buildings,true);
 buildings[1].dead=true;units[1].routing=true;assert.equal(m.elimination(units,buildings,4,zones()),null);
 units[1].dead=true;const result=m.elimination(units,buildings,5,zones());assert.equal(result.winner,'france');assert.equal(result.stats.britain.unitsRemaining,1);
 const draw=create();units[0].dead=true;buildings[0].dead=true;assert.equal(draw.elimination(units,buildings,6,zones()).winner,'draw');
});
test('statistics count real training after the opening, unique losses, revival and freeze at the result',()=>{
 const m=create(),units=[u(1),u(2,'britain')],buildings=[b(3,'france'),b(4,'britain')];m.observe(units,buildings,true);
 units.push(u(5,'britain','worker'));m.observe(units,buildings);units[1].dead=true;m.observe(units,buildings);units[1].dead=false;m.observe(units,buildings);units[1].dead=true;buildings[1].dead=true;
 const r=m.elimination(units,buildings,30,zones());assert.deepEqual(r.stats.britain,{trained:1,unitsLost:1,buildingsLost:1,unitsRemaining:1,buildingsRemaining:0,territories:0});
 units.push(u(6));m.observe(units,buildings);assert.deepEqual(m.state().result,r);
 const fresh=create();fresh.observe(units,buildings,true);assert.equal(fresh.state().result,null);assert.equal('stats' in fresh.state(),false);
});
