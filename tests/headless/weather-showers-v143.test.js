'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(){
 const s=createSandbox({globals:{document:{readyState:'complete',createElement:()=>({style:{},textContent:''}),getElementById:()=>null},
  elapsed:0,gameOver:false,fire:()=>{},updateBuildings:()=>{},updateHud:()=>{},resetGame:()=>{s.context.elapsed=0;},
  TYPES:{infantry:{reload:3}},visionRadius:()=>215}});
 s.window.location={search:'?view=iso'};loadProductionScript(s.context,'src/foundation/config.js');
 loadProductionScript(s.context,'src/systems/world/weather-v1.js');
 return{api:s.window.__WEATHER_V1__,step(n){for(let i=0;i<n;i++){s.context.elapsed++;s.context.updateBuildings(1);}},fire(){for(let i=0;i<200;i++)s.context.fire({type:'infantry'},{});},reset:()=>s.context.resetGame()};
}
test('natural showers gather cloud, arrive without forcing, then give a dry break and return',()=>{
 const s=setup();assert.equal(s.api.state().kind,'clear');s.step(80);assert.equal(s.api.state().kind,'overcast');
 s.step(26);assert.equal(s.api.state().kind,'rain');assert.ok(s.api.state().rain>0);
 s.step(30);assert.ok(s.api.state().rain>.99);assert.ok(s.api.state().wetness>.3);
 const firstEnd=s.api.state().until,due=s.api.state().nextRainAt;
 assert.ok(due-firstEnd>=150&&due-firstEnd<=240);
 s.step(Math.ceil(firstEnd)-136);assert.equal(s.api.state().kind,'overcast');const wet=s.api.state().wetness;
 s.step(30);assert.equal(s.api.state().rain,0);assert.ok(s.api.state().wetness>0);assert.ok(s.api.state().wetness<wet+.15);
 s.step(Math.ceil(due)-Math.ceil(firstEnd)-30);assert.equal(s.api.state().kind,'rain');
});
test('combat randomness does not move rain dates and reset reproduces the weather schedule',()=>{
 const a=setup(),b=setup();a.step(130);b.step(130);a.fire();a.step(45);b.step(45);
 assert.equal(a.api.state().nextRainAt,b.api.state().nextRainAt);assert.equal(a.api.state().until,b.api.state().until);
 a.reset();a.step(175);assert.deepEqual({...a.api.state()},{...b.api.state()});assert.equal(a.api.stats().misfires,0);
});
test('explicit diagnostic weather holds are respected until they expire',()=>{
 const a=setup();a.api.set('clear',999);a.step(300);assert.equal(a.api.state().kind,'clear');assert.equal(a.api.state().rain,0);
 assert.equal(a.api.set('unknown'),false);a.api.set('rain',999);a.step(90);assert.ok(a.api.state().wetness>.9);assert.equal(a.api.state().kind,'rain');
});
