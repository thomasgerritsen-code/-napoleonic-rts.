'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {createSandbox,loadProductionScript}=require('./harness');
function setup(){
 const s=createSandbox({globals:{WORLD:{width:8000,height:5000},buildings:[],units:[],regiments:[],
  moveToward:()=>{},update:()=>{},TYPES:{infantry:{speed:50}}},window:{
  NRTS:{events:{on:()=>{}},subsystems:{has:()=>false,register:()=>{}}},
  VILLAGE_SCENERY_V4:[{houses:[{id:'rotated',x:2000,y:1500,w:120,h:80,angle:Math.PI/4}]}]
 }});
 loadProductionScript(s.context,'src/systems/movement/stuck-recovery-v1.js');return s;
}
test('non-finite and very long segment queries terminate using the full-scan fallback',()=>{
 const s=setup();
 assert.equal(vm.runInContext("window.__STUCK_RECOVERY_V2__.segmentBlocked({x:Infinity,y:0},{x:Infinity,y:1})",s.context,{timeout:100}),false);
 assert.equal(vm.runInContext("window.__STUCK_RECOVERY_V2__.segmentBlocked({x:-1e10,y:1500},{x:1e10,y:1500})",s.context,{timeout:100}),true);
});
test('a rotated house is indexed at its corners and unrelated cells skip it',()=>{
 const s=setup(),api=s.window.__STUCK_RECOVERY_V2__;
 // Rotated local (55,30) lies near the corner, outside the unrotated footprint.
 const x=2000+(55-30)/Math.SQRT2,y=1500+(55+30)/Math.SQRT2;
 assert.equal(api.segmentBlocked({x:x-1,y},{x:x+1,y}),true);
 const n=api.stats().obstacleCandidates;
 for(let i=0;i<100;i++)assert.equal(api.segmentBlocked({x:7000,y:4000},{x:7010,y:4000}),false);
 assert.equal(api.stats().obstacleCandidates,n);assert.equal(api.stats().obstacleBuilds,1);
});
