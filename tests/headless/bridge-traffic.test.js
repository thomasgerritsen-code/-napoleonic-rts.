'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSandbox, loadProductionScript } = require('./harness');

function loadTrafficModel() {
  const crossings = [
    { id:'bridge', name:'Test Bridge', type:'bridge', x:0, y:0, angle:0, length:270, width:112 },
    { id:'ford', name:'Test Ford', type:'ford', x:0, y:300, angle:0, length:240, width:150 }
  ];
  const regiments = [];
  const byId = id => regiments.find(reg => reg.id === id) || null;

  const { context } = createSandbox({
    seed: 246813579,
    globals: {
      document: { title:'', querySelector:() => null },
      WATER_CROSSINGS_V067: crossings,
      regiments,
      elapsed: 0,
      regimentMembers: reg => reg?.members || [],
      centroid: members => ({
        x: members.reduce((sum,u) => sum + u.x, 0) / Math.max(1,members.length),
        y: members.reduce((sum,u) => sum + u.y, 0) / Math.max(1,members.length)
      }),
      groupKindV06: reg => reg.kind,
      bankSideV067: x => x,
      segmentWaterCrossingV067: () => null,
      getRegiment: byId,
      normalizeAngleV063: angle => Math.atan2(Math.sin(angle),Math.cos(angle)),
      marchColumnOffsetsV063: reg => new Map((reg.members || []).map((u,index) => [u.id,{ox:-index*20,oy:0}])),
      blendFormationOffsetsV064: (_reg,_march,desired) => desired,
      applyFormationTargetsV063: () => {},
      setLocomotionTargetsV064: () => {},
      desiredGroupSpeedV064: () => 60,
      crossingSpeedCapV067: () => 38,
      crossingPassageContainsV067: (c,x,y) => Math.abs(x-c.x) <= c.length/2 && Math.abs(y-c.y) <= c.width/2,
      turnTowardV064: (_current,target) => target,
      updateGroupPathsV06: () => {},
      orderGroupPathV06: () => {},
      drawCrossingsV067: () => {},
      resetGame: () => {},
      statusEl: { textContent:'' },
      ctx: {},
      camera: { zoom:1 }
    }
  });

  loadProductionScript(context,'src/v068.js');
  return { context, crossings, regiments };
}

function makeRegiment(id, x, y, crossingId) {
  return {
    id,
    kind:'infantry',
    destroyed:false,
    members:[{id:`${id}-1`,x,y},{id:`${id}-2`,x:x-12,y}],
    marchV063:{v064:true,anchorX:x,anchorY:y,marchFacing:0,speedV064:0},
    routeCrossingsV067:[{id:crossingId}],
    path:[],
    pathIndex:0,
    finalTarget:{x:600,y},
    formation:'line'
  };
}

test('production v068 keeps bridges single-lane and fords two-wide', () => {
  const { context, regiments } = loadTrafficModel();
  regiments.push(
    makeRegiment('b1',-300,0,'bridge'),
    makeRegiment('b2',-360,0,'bridge'),
    makeRegiment('f1',-300,300,'ford'),
    makeRegiment('f2',-360,300,'ford'),
    makeRegiment('f3',-420,300,'ford')
  );

  context.prepareCrossingTrafficV068();

  const [b1,b2,f1,f2,f3] = regiments;
  assert.equal(b1.crossingTrafficV068.state,'approach');
  assert.equal(b2.crossingTrafficV068.state,'waiting');
  assert.equal(b2.crossingTrafficV068.queuePosition,1);
  assert.equal(f1.crossingTrafficV068.state,'approach');
  assert.equal(f2.crossingTrafficV068.state,'approach');
  assert.equal(f3.crossingTrafficV068.state,'waiting');
  assert.equal(f3.crossingTrafficV068.queuePosition,1);
});

test('production v068 promotes the waiting battalion only after the bridge holder clears', () => {
  const { context, crossings, regiments } = loadTrafficModel();
  const bridge = crossings[0];
  const first = makeRegiment('first',-300,0,'bridge');
  const second = makeRegiment('second',-360,0,'bridge');
  regiments.push(first,second);

  context.prepareCrossingTrafficV068();
  assert.equal(first.crossingTrafficV068.state,'approach');
  assert.equal(second.crossingTrafficV068.state,'waiting');

  first.marchV063.anchorX = 0;
  first.members.forEach((u,index) => { u.x = index ? -12 : 0; u.y = 0; });
  context.updateHolderStateV068(first,first.marchV063,first.crossingTrafficV068,bridge);
  assert.equal(first.crossingTrafficV068.state,'crossing');
  assert.equal(second.crossingTrafficV068.state,'waiting');

  first.marchV063.anchorX = 330;
  first.members.forEach((u,index) => { u.x = 330-index*12; u.y = 0; });
  context.updateHolderStateV068(first,first.marchV063,first.crossingTrafficV068,bridge);
  assert.equal(first.crossingTrafficV068.state,'clearing');

  context.promoteTrafficQueuesV068();
  assert.equal(second.crossingTrafficV068.state,'approach');
  assert.equal(second.crossingTrafficV068.queuePosition,0);
});
