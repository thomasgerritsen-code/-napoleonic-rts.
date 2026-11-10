'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(search='?view=iso'){
 const s=createSandbox({globals:{document:{readyState:'loading'},elapsed:0},window:{location:{search},addEventListener:()=>{}}});
 loadProductionScript(s.context,'src/foundation/config.js');loadProductionScript(s.context,'src/systems/world/day-night-v1.js');
 return{api:s.window.__DAY_NIGHT_V1__,context:s.context};
}
test('a full ten-minute visual day crosses evening, night, sunrise and returns to daytime',()=>{
 const {api}=setup();
 for(const [time,phase,clock] of [[0,'day','08:00'],[225,'evening','17:00'],[300,'night','20:00'],[400,'night','00:00'],[525,'morning','05:00'],[600,'day','08:00']]){
  const a=api.at(time);assert.equal(a.phase,phase);assert.equal(a.clock,clock);
 }
 assert.equal(api.at(0).alpha,0);assert.equal(api.at(0).tint,null);assert.equal(api.at(400).alpha,.34);
 assert.equal(api.at(400).day,2);assert.equal(api.at(600).day,2);
});
test('twilight stays continuous across boundaries and does not make midnight unreadably dark',()=>{
 const {api}=setup();
 for(let time=0;time<1200;time+=.25){const a=api.at(time),b=api.at(time+.25);
  assert.ok(Number.isFinite(a.alpha));assert.ok(a.alpha>=0&&a.alpha<.4);
  assert.ok(Math.abs(a.alpha-b.alpha)<.01);assert.ok(Math.abs(a.night-b.night)<.01);
 }
 for(const hour of [5,8,17,20,24]){
  const t=((hour-8+24)%24)/24*600,a=api.at(t-.001),b=api.at(t+.001);
  if(t>0)assert.ok(Math.abs(a.alpha-b.alpha)<.001);
 }
 assert.ok(api.at(262.5).warmth>.99);assert.ok(api.at(562.5).warmth>.99);
});
test('the cycle is periodic, uses only simulation time, and resets when a battle returns to zero',()=>{
 const {api,context}=setup();context.elapsed=333.25;
 const a=api.state();assert.equal(api.state(),a);assert.ok(Object.isFrozen(a));assert.equal(context.elapsed,333.25);
 for(const time of [0,100,250,350,550]){
  const x=api.at(time),y=api.at(time+600);assert.equal(x.hour,y.hour);assert.equal(x.tint,y.tint);assert.equal(x.phase,y.phase);
 }
 context.elapsed=0;assert.equal(api.state().clock,'08:00');assert.equal(api.state().phase,'day');
});
test('legacy non-isometric games get no clock, rendering hooks or day/night module',()=>{
 assert.equal(setup('?test=legacy').api,undefined);
});
