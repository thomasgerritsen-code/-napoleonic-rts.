'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadProductionScript } = require('./harness');

function loadTrafficRuntime() {
  const bridge = { id:'pont-test', name:'Pont Test', type:'bridge', x:0, y:0, angle:0, length:270, width:112 };
  const ford = { id:'gue-test', name:'Gué Test', type:'ford', x:0, y:500, angle:0, length:270, width:154 };
  const regiments = [];
  const noop = () => {};
  const ctx = {
    save:noop, restore:noop, fillRect:noop, fillText:noop,
    measureText:() => ({width:20}), textAlign:'start', font:'', fillStyle:''
  };

  const { context } = createSandbox({
    seed: 6801,
    globals: {
      document:{ title:'', querySelector:() => null },
      WATER_CROSSINGS_V067:[bridge,ford],
      regiments,
      elapsed:0,
      getRegiment:id => regiments.find(reg => reg.id === id) || null,
      regimentMembers:reg => reg.members || [],
      centroid:members => ({
        x:members.reduce((sum,u)=>sum+u.x,0)/Math.max(1,members.length),
        y:members.reduce((sum,u)=>sum+u.y,0)/Math.max(1,members.length)
      }),
      groupKindV06:reg => reg.kind,
      bankSideV067:(x) => x,
      normalizeAngleV063:a => a,
      segmentWaterCrossingV067:() => null,
      marchColumnOffsetsV063:() => new Map(),
      blendFormationOffsetsV064:(_reg,_march,desired) => desired,
      applyFormationTargetsV063:noop,
      setLocomotionTargetsV064:noop,
      desiredGroupSpeedV064:() => 60,
      crossingSpeedCapV067:() => 38,
      turnTowardV064:(_from,to) => to,
      crossingPassageContainsV067:(crossing,x,y) => Math.abs(x-crossing.x)<=crossing.length/2 && Math.abs(y-crossing.y)<=crossing.width/2,
      updateGroupPathsV06:noop,
      orderGroupPathV06:noop,
      drawCrossingsV067:noop,
      ctx,
      camera:{zoom:1},
      resetGame:noop,
      statusEl:{textContent:''}
    }
  });

  loadProductionScript(context, 'src/v068.js');
  return { context, bridge, ford, regiments };
}

function regiment(id, x) {
  return {
    id,
    kind:'infantry',
    destroyed:false,
    formation:'line',
    members:[{id:`${id}-1`,x,y:0}],
    marchV063:{v064:true,anchorX:x,anchorY:0,marchFacing:0,speedV064:20},
    routeCrossingsV067:[]
  };
}

test('production v068 bridge queue enforces capacity and promotes the next battalion after release', () => {
  const { context, bridge, regiments } = loadTrafficRuntime();
  const first = regiment('first',-300);
  const second = regiment('second',-430);
  regiments.push(first,second);

  context.registerTrafficV068(first,bridge);
  context.registerTrafficV068(second,bridge);
  context.promoteTrafficQueuesV068();

  let state = context.CROSSING_TRAFFIC_V068.get(bridge.id);
  assert.deepEqual(Array.from(state.holderIds),['first']);
  assert.deepEqual(Array.from(state.queue),['second']);
  assert.equal(first.crossingTrafficV068.state,'approach');
  assert.equal(second.crossingTrafficV068.state,'waiting');
  assert.equal(second.crossingTrafficV068.queuePosition,1);
  assert.equal(state.capacity,1);

  first.crossingTrafficV068.entered=true;
  first.marchV063.anchorX=400;
  first.members[0].x=400;
  context.updateHolderStateV068(first,first.marchV063,first.crossingTrafficV068,bridge);
  context.promoteTrafficQueuesV068();

  state = context.CROSSING_TRAFFIC_V068.get(bridge.id);
  assert.deepEqual(Array.from(state.holderIds),['second']);
  assert.deepEqual(Array.from(state.queue),[]);
  assert.equal(first.crossingTrafficV068.state,'clearing');
  assert.equal(second.crossingTrafficV068.state,'approach');
});

test('production v068 keeps ford capacity wider than bridge capacity', () => {
  const { context, bridge, ford } = loadTrafficRuntime();
  assert.equal(context.CROSSING_TRAFFIC_V068.get(bridge.id).capacity,1);
  assert.equal(context.CROSSING_TRAFFIC_V068.get(ford.id).capacity,2);
});
