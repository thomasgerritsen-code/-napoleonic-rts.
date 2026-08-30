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

    function resetWorld() {
      resetGame();
      v05PeaceMode=true;
      gameOver=false;
      for (const u of units) u.dead=true;
      for (const r of regiments) r.destroyed=true;
    }

    function makeInfantry(x,y) {
      const made=[];
      for (let i=0;i<18;i++) made.push(createUnit('france','infantry',x+(i%9)*14,y+Math.floor(i/9)*16));
      made.push(createUnit('france','officer',x+38,y-24));
      made.push(createUnit('france','drummer',x+58,y-24));
      return createRegiment('france',made);
    }

    function run(c) {
      resetWorld();
      const side=-1;
      const distance=c.length/2+160;
      const start=crossingPointV068(c,side*distance,c.width*.18);
      const target=crossingPointV068(c,-side*distance,-c.width*.12);
      const reg=makeInfantry(start.x,start.y);
      orderGroupPathV06(reg,target.x,target.y,'column',c.angle);

      for (let i=0;i<10;i++) window.RTS_SIM.step(.05);
      const living=regimentMembers(reg).filter(u=>!u.dead);
      const victims=living.slice(0,4);
      const corner=crossingPointV068(c,side*(c.length/2+8),c.width*.5+18);
      for (const u of victims) {
        u.x=corner.x;
        u.y=corner.y;
        u.arrivedAtTarget=false;
      }

      const before=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
      let maxBlocked=0;
      let waterSeen=0;
      let movedAfterRecovery=false;
      const initial=victims.map(u=>({id:u.id,x:u.x,y:u.y}));

      for (let step=0;step<360;step++) {
        window.RTS_SIM.step(.05);
        const current=regimentMembers(reg).filter(u=>!u.dead);
        waterSeen=Math.max(waterSeen,current.filter(u=>waterAtV067(u.x,u.y)).length);
        maxBlocked=Math.max(maxBlocked,current.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length);
        if (step>35) {
          movedAfterRecovery=victims.some(u=>{
            const p=initial.find(x=>x.id===u.id);
            return p&&Math.hypot(u.x-p.x,u.y-p.y)>24;
          }) || movedAfterRecovery;
        }
      }

      const after=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
      const final=regimentMembers(reg).filter(u=>!u.dead);
      const center=centroid(final);
      const remaining=Math.hypot(center.x-target.x,center.y-target.y);
      return {
        crossing:c.id,
        type:c.type,
        recoveries:(after.unitRecoveries-before.unitRecoveries)+(after.groupRecoveries-before.groupRecoveries),
        blockedRecoveries:after.blockedTargetRecoveries-before.blockedTargetRecoveries,
        movedAfterRecovery,
        waterSeen,
        maxBlocked,
        finalBlocked:final.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length,
        finalWater:final.filter(u=>waterAtV067(u.x,u.y)).length,
        remaining:+remaining.toFixed(1),
        pathLength:reg.path?.length||0,
        crossingState:reg.crossingTrafficV068?.state||null
      };
    }

    const bridge=WATER_CROSSINGS_V067.find(c=>c.type==='bridge');
    const ford=WATER_CROSSINGS_V067.find(c=>c.type==='ford');
    scenarios.push(run(bridge));
    scenarios.push(run(ford));
    return {scenarios,stats:window.__RIVER_CROSSING_RECOVERY_V1__.stats()};
  });

  console.log('RIVER_CROSSING_RECOVERY', JSON.stringify(result));
  expect(result.scenarios).toHaveLength(2);
  for (const scenario of result.scenarios) {
    expect(scenario.recoveries).toBeGreaterThan(0);
    expect(scenario.movedAfterRecovery).toBe(true);
    expect(scenario.waterSeen).toBe(0);
    expect(scenario.finalWater).toBe(0);
    expect(scenario.finalBlocked).toBe(0);
  }
  expect(result.stats.unitRecoveries + result.stats.groupRecoveries).toBeGreaterThanOrEqual(2);
});
