'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadProductionScript, runFixedSteps } = require('./harness');

function loadFollowerRuntime({ road = true } = {}) {
  const { context } = createSandbox({
    seed: 7101,
    globals: {
      URLSearchParams,
      location:{search:'?test=v070'},
      TYPES:{ infantry:{speed:60,radius:5}, cavalry:{speed:90,radius:7} },
      WORLD:{width:4000,height:2400},
      groupKindV06:reg => reg.kind,
      roadNetworkAtV066:() => road ? {road:{roadClass:'chaussee',name:'Headless Chaussee'}} : null,
      normalizeAngleV063:a => Math.atan2(Math.sin(a),Math.cos(a)),
      clampV064:(value,min,max) => Math.max(min,Math.min(max,value)),
      moveToward:() => false,
      getRegiment:() => null,
      units:[],
      nearbyNavUnits:() => [],
      navStats:{overlapCorrections:0}
    }
  });
  loadProductionScript(context,'src/foundation/config.js');
  loadProductionScript(context,'src/systems/movement/state.js');
  loadProductionScript(context,'src/systems/formation/followers.js');
  return context;
}

test('production damped follower tracks a moving road slot without exceeding the infantry hard cap', () => {
  const context=loadFollowerRuntime({road:true});
  const reg={kind:'infantry',destroyed:false,facing:0,marchV063:{v064:true,anchorX:1000,anchorY:900},crossingTrafficV068:null};
  const u={id:1,type:'infantry',x:900,y:900,targetX:900,targetY:900,facing:0,dead:false,routing:false};
  const dt=1/60;
  let targetX=900;
  let maxStep=0;
  let maxSpeed=0;
  let previousX=u.x;

  runFixedSteps({
    durationSeconds:4,
    hz:60,
    state:{},
    step(){
      targetX+=60*dt;
      context.dampedSlotMoveV071(u,reg,targetX,900,dt);
      const step=Math.abs(u.x-previousX);
      maxStep=Math.max(maxStep,step);
      maxSpeed=Math.max(maxSpeed,step/dt);
      previousX=u.x;
    }
  });

  assert.ok(maxSpeed<=124.0001,`follower exceeded hard cap: ${maxSpeed}`);
  assert.ok(maxStep<=124/60+1e-6,'one fixed step moved farther than the hard cap allows');
  assert.ok(Math.abs(targetX-u.x)<12,`follower failed to track moving slot: error ${targetX-u.x}`);
  assert.ok(u.x>1100,'follower should make sustained forward progress');
});

test('production damped follower converges through a formation slot transition without teleporting', () => {
  const context=loadFollowerRuntime({road:false});
  const reg={kind:'infantry',destroyed:false,facing:Math.PI/2,marchV063:{v064:true,anchorX:1000,anchorY:900},crossingTrafficV068:null};
  const u={id:2,type:'infantry',x:1000,y:900,targetX:1000,targetY:900,facing:0,dead:false,routing:false};
  const dt=1/60;
  const target={x:1060,y:975};
  let maxStep=0;
  let previous={x:u.x,y:u.y};

  runFixedSteps({
    durationSeconds:3,
    hz:60,
    state:{},
    step(){
      context.dampedSlotMoveV071(u,reg,target.x,target.y,dt);
      maxStep=Math.max(maxStep,Math.hypot(u.x-previous.x,u.y-previous.y));
      previous={x:u.x,y:u.y};
    }
  });

  assert.ok(maxStep<=124/60+1e-6,`formation transition teleported ${maxStep}px in one fixed step`);
  assert.ok(Math.hypot(target.x-u.x,target.y-u.y)<1.5,'follower did not converge on the new slot');
  assert.ok(Math.abs(Math.atan2(Math.sin(u.facing-reg.facing),Math.cos(u.facing-reg.facing)))<0.05,'facing did not converge smoothly');
});
