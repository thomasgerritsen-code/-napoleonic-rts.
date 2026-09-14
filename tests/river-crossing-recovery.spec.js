const { test, expect } = require('@playwright/test');

async function openGame(page) {
  await page.addInitScript(() => {
    let seed = 881177;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=movement-coverage', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.__RIVER_CROSSING_RECOVERY_V1__));
}

test('stalled soldiers at river banks, bridge corners and ford recover locally without entering blocked water', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);

  const result = await page.evaluate(() => {
    const scenarios=[];
    function resetWorld(){resetGame();v05PeaceMode=true;gameOver=false;for(const u of units)u.dead=true;for(const r of regiments)r.destroyed=true;}
    function makeInfantry(x,y){const made=[];for(let i=0;i<18;i++)made.push(createUnit('france','infantry',x+(i%9)*14,y+Math.floor(i/9)*16));made.push(createUnit('france','officer',x+38,y-24));made.push(createUnit('france','drummer',x+58,y-24));return createRegiment('france',made);}

    function run(c){
      resetWorld();
      const side=-1,distance=c.length/2+160;
      const start=crossingPointV068(c,side*distance,c.width*.18),target=crossingPointV068(c,-side*distance,-c.width*.12);
      const reg=makeInfantry(start.x,start.y);orderGroupPathV06(reg,target.x,target.y,'column',c.angle);
      for(let i=0;i<10;i++)window.RTS_SIM.step(.05);

      const living=regimentMembers(reg).filter(u=>!u.dead),victims=living.slice(0,4);
      const corner=crossingPointV068(c,side*(c.length/2+8),c.width*.5+18);
      for(const u of victims){u.x=corner.x;u.y=corner.y;u.arrivedAtTarget=false;}
      const initial=victims.map(u=>({id:u.id,x:corner.x,y:corner.y}));
      const before=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
      let waterSeen=0,maxBlocked=0,movedAfterRecovery=false;

      for(let step=0;step<30;step++){
        for(const u of victims){u.x=corner.x;u.y=corner.y;u.arrivedAtTarget=false;}
        window.RTS_SIM.step(.05);
      }

      const during=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
      for(let step=0;step<360;step++){
        window.RTS_SIM.step(.05);
        const current=regimentMembers(reg).filter(u=>!u.dead);
        waterSeen=Math.max(waterSeen,current.filter(u=>waterAtV067(u.x,u.y)).length);
        maxBlocked=Math.max(maxBlocked,current.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length);
        if(step>15)movedAfterRecovery=victims.some(u=>{const p=initial.find(x=>x.id===u.id);return p&&Math.hypot(u.x-p.x,u.y-p.y)>24;})||movedAfterRecovery;
      }

      const after=window.__RIVER_CROSSING_RECOVERY_V1__.stats(),final=regimentMembers(reg).filter(u=>!u.dead),center=centroid(final);
      return{
        crossing:c.id,type:c.type,
        recoveriesDuringForcedStall:(during.unitRecoveries-before.unitRecoveries)+(during.groupRecoveries-before.groupRecoveries),
        totalRecoveries:(after.unitRecoveries-before.unitRecoveries)+(after.groupRecoveries-before.groupRecoveries),
        blockedRecoveries:after.blockedTargetRecoveries-before.blockedTargetRecoveries,
        movedAfterRecovery,waterSeen,maxBlocked,
        finalBlocked:final.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length,
        finalWater:final.filter(u=>waterAtV067(u.x,u.y)).length,
        remaining:+Math.hypot(center.x-target.x,center.y-target.y).toFixed(1),pathLength:reg.path?.length||0,crossingState:reg.crossingTrafficV068?.state||null
      };
    }

    const bridge=WATER_CROSSINGS_V067.find(c=>c.type==='bridge'),ford=WATER_CROSSINGS_V067.find(c=>c.type==='ford');
    scenarios.push(run(bridge));scenarios.push(run(ford));
    return{scenarios,stats:window.__RIVER_CROSSING_RECOVERY_V1__.stats()};
  });

  console.log('RIVER_CROSSING_RECOVERY',JSON.stringify(result));
  expect(result.scenarios).toHaveLength(2);
  for(const scenario of result.scenarios){
    expect(scenario.recoveriesDuringForcedStall).toBeGreaterThan(0);
    expect(scenario.totalRecoveries).toBeGreaterThan(0);
    expect(scenario.movedAfterRecovery).toBe(true);
    expect(scenario.waterSeen).toBe(0);
    expect(scenario.finalWater).toBe(0);
    expect(scenario.finalBlocked).toBe(0);
  }
  expect(result.stats.unitRecoveries+result.stats.groupRecoveries).toBeGreaterThanOrEqual(2);
});

test('bridge holder lateral jitter cannot mask a pre-entry forward-axis stall', async ({ page }) => {
  test.setTimeout(90_000);
  await openGame(page);

  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;for(const r of regiments)r.destroyed=true;
    const bridge=WATER_CROSSINGS_V067.find(c=>c.type==='bridge');
    const side=-1,start=crossingPointV068(bridge,side*(bridge.length/2+95),0),target=crossingPointV068(bridge,-side*(bridge.length/2+230),0);
    const made=[];for(let i=0;i<24;i++)made.push(createUnit('france','infantry',start.x+(i%6)*12,start.y+Math.floor(i/6)*14));
    made.push(createUnit('france','officer',start.x+18,start.y-18));made.push(createUnit('france','drummer',start.x+34,start.y-18));
    const reg=createRegiment('france',made);orderGroupPathV06(reg,target.x,target.y,'column',bridge.angle);
    for(let i=0;i<16;i++)window.RTS_SIM.step(.05);
    const info=reg.crossingTrafficV068;
    if(!info)return{setup:false};
    info.state='approach';info.entered=false;info.forcedColumn=true;
    const before=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    const local0=crossingLocalV068(bridge,reg.marchV063.anchorX,reg.marchV063.anchorY);
    const fixedAlong=local0.along;

    // Simulate the real failure shape: visible/lateral motion around the bridge mouth
    // while no meaningful progress is made along the bridge axis. Legacy Euclidean
    // stall detection treated this as movement forever and never recovered.
    for(let step=0;step<42;step++){
      const lateral=(step%2?1:-1)*5;
      const p=crossingPointV068(bridge,fixedAlong,lateral);
      const dx=p.x-reg.marchV063.anchorX,dy=p.y-reg.marchV063.anchorY;
      reg.marchV063.anchorX=p.x;reg.marchV063.anchorY=p.y;
      for(const u of regimentMembers(reg)){u.x+=dx;u.y+=dy;u.arrivedAtTarget=false;}
      window.RTS_SIM.step(.05);
      info.state='approach';info.entered=false;info.forcedColumn=true;
    }
    const during=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    const recoveryReason=reg.navigationV2?.bridgeRecoveryReason||null;
    const recoveryTarget=reg.path?.[0]||null;
    const safeTarget=!!recoveryTarget&&!waterAtV067(recoveryTarget.x,recoveryTarget.y)&&!segmentCrossesBlockedWaterV067(reg.marchV063.anchorX,reg.marchV063.anchorY,recoveryTarget.x,recoveryTarget.y);

    for(let step=0;step<300;step++)window.RTS_SIM.step(.05);
    const finalMembers=regimentMembers(reg).filter(u=>!u.dead),center=centroid(finalMembers),after=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    const initialSide=Math.sign(bankSideV067(start.x,start.y)),finalSide=Math.sign(bankSideV067(center.x,center.y));
    return{
      setup:true,
      axisRecoveries:during.axisStallRecoveries-before.axisStallRecoveries,
      groupRecoveries:during.groupRecoveries-before.groupRecoveries,
      recoveryReason,safeTarget,
      maxAxisNoProgressSeconds:during.maxAxisNoProgressSeconds,
      crossed:initialSide!==0&&finalSide!==0&&initialSide!==finalSide,
      water:finalMembers.filter(u=>waterAtV067(u.x,u.y)).length,
      finalState:reg.crossingTrafficV068?.state||null,
      totalAxisRecoveries:after.axisStallRecoveries-before.axisStallRecoveries
    };
  });

  console.log('BRIDGE_AXIS_STALL_RECOVERY',JSON.stringify(result));
  expect(result.setup).toBe(true);
  expect(result.axisRecoveries).toBeGreaterThan(0);
  expect(result.groupRecoveries).toBeGreaterThan(0);
  expect(result.recoveryReason).toBe('axis-stall');
  expect(result.safeTarget).toBe(true);
  expect(result.maxAxisNoProgressSeconds).toBeGreaterThanOrEqual(1);
  expect(result.water).toBe(0);
});
