'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createSandbox,loadProductionScript}=require('./harness');
function rate(search){
 const s=createSandbox({globals:{elapsed:0},window:{location:{search}}});loadProductionScript(s.context,'src/foundation/config.js');
 return s.window.NRTS_CONFIG.simulation;
}
// Singleplayer simulates 30 steps a second (large armies on a phone); multiplayer,
// the server (no mode) and ?simhz=60 keep 60. Game time runs at the same pace.
test('singleplayer runs at 30 steps a second, multiplayer and the server at 60',()=>{
 for(const [search,hz] of [['?view=iso&mode=singleplayer',30],['?view=iso&mode=singleplayer&lab=1',30],
  ['?view=iso&mode=multiplayer',60],['?view=iso&test=net&gpu=off',60],['?view=iso&mode=singleplayer&simhz=60',60],['',60]]){
  const sim=rate(search);assert.equal(sim.fixedHz,hz,search);assert.equal(sim.fixedDt,1/hz,search);
  assert.equal(sim.maxFrameDt,.05);
 }
});
