const { test, expect } = require('@playwright/test');

test('Pont des Fermes west-east infantry line clears blocked follower targets automatically', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    let seed=773311;
    Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__RIVER_CROSSING_RECOVERY_V1__));

  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;for(const u of units)u.dead=true;for(const r of regiments)r.destroyed=true;
    const c=WATER_CROSSINGS_V067.find(x=>x.id==='pont-fermes'),side=-1,lateral=-42,distance=c.length/2+210;
    const start=crossingPointV068(c,side*distance,lateral),target=crossingPointV068(c,-side*distance,-lateral*.35);
    const made=[];for(let i=0;i<18;i++)made.push(createUnit('france','infantry',start.x+(i%9)*16,start.y+Math.floor(i/9)*18));
    made.push(createUnit('france','officer',start.x+55,start.y-30));made.push(createUnit('france','drummer',start.x+80,start.y-30));
    const reg=createRegiment('france',made),before=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    orderGroupPathV06(reg,target.x,target.y,'line',c.angle+(side<0?0:Math.PI));
    let completed=false,maxBlocked=0,waterSeen=0,longestStall=0,last=centroid(regimentMembers(reg).filter(u=>!u.dead)),lastMovedAt=elapsed;
    for(let step=0;step<1800;step++){
      window.RTS_SIM.step(.05);if(step%5)continue;
      const living=regimentMembers(reg).filter(u=>!u.dead),center=centroid(living),remaining=Math.hypot(target.x-center.x,target.y-center.y);
      const blocked=living.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length;
      maxBlocked=Math.max(maxBlocked,blocked);waterSeen=Math.max(waterSeen,living.filter(u=>waterAtV067(u.x,u.y)).length);
      const moved=Math.hypot(center.x-last.x,center.y-last.y);if(moved>.75){last=center;lastMovedAt=elapsed;}else longestStall=Math.max(longestStall,elapsed-lastMovedAt);
      const pathDone=(reg.path?.length||0)===0;
      if((remaining<75||pathDone)&&blocked===0&&living.every(u=>!waterAtV067(u.x,u.y))){completed=true;break;}
    }
    const living=regimentMembers(reg).filter(u=>!u.dead),center=centroid(living),after=window.__RIVER_CROSSING_RECOVERY_V1__.stats();
    return{completed,remaining:+Math.hypot(target.x-center.x,target.y-center.y).toFixed(1),maxBlocked,finalBlocked:living.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length,waterSeen,finalWater:living.filter(u=>waterAtV067(u.x,u.y)).length,longestStall:+longestStall.toFixed(2),recoveries:after.unitRecoveries-before.unitRecoveries,blockedRecoveries:after.blockedTargetRecoveries-before.blockedTargetRecoveries,blockedSegmentContexts:after.blockedSegmentContexts-before.blockedSegmentContexts,crossingState:reg.crossingTrafficV068?.state||null};
  });
  console.log('PONT_FERMES_FOLLOWER_RECOVERY',JSON.stringify(result));
  expect(result.completed).toBe(true);
  expect(result.finalBlocked).toBe(0);
  expect(result.waterSeen).toBe(0);
  expect(result.finalWater).toBe(0);
});
