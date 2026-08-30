const { test, expect } = require('@playwright/test');

async function openBridgeSafety(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=bridgefollowers',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.RTS_SIM && window.NRTS_NAVIGATION_V2?.active && window.__BRIDGE_FOLLOWER_SAFETY_V1__
  ));
  return errors;
}

test('rear soldier at a bridge corner gets a legal deck target instead of pushing into water',async({page})=>{
  const errors=await openBridgeSafety(page);
  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(true);
    const c=WATER_CROSSINGS_V067.find(item=>item.id==='pont-crete');
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',c.x-250,c.y+75);
    const reg=getRegiment(id);
    orderGroupPathV06(reg,c.x+320,c.y-35,'line',0);
    const march=reg.marchV063;
    const info={crossingId:c.id,crossingName:c.name,state:'crossing',queuePosition:0,initialSide:-1,entered:true,forcedColumn:true};
    reg.crossingTrafficV068=info;
    march.anchorX=c.x+90;march.anchorY=c.y;march.marchFacing=c.angle;
    const members=regimentMembers(reg),lagger=members[members.length-1];
    const corner=crossingPointV068(c,-c.length/2-24,c.width/2+24);
    lagger.x=corner.x;lagger.y=corner.y;
    forceBridgeColumnTargetsV068(reg,march,info);
    const blocked=segmentCrossesBlockedWaterV067(lagger.x,lagger.y,lagger.targetX,lagger.targetY);
    return{
      blocked,
      marker:lagger.bridgeFollowerSafetyV1||null,
      water:waterAtV067(lagger.x,lagger.y),
      target:{x:lagger.targetX,y:lagger.targetY},
      stats:window.__BRIDGE_FOLLOWER_SAFETY_V1__.stats()
    };
  });
  expect(result.water).toBe(false);
  expect(result.blocked).toBe(false);
  expect(result.marker?.crossingId).toBe('pont-crete');
  expect(result.stats.corrections).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('angled full battalion crossing clears every soldier from the bridge',async({page})=>{
  const errors=await openBridgeSafety(page);
  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__.setPeaceMode(true);
    const nav=window.NRTS_NAVIGATION_V2,c=WATER_CROSSINGS_V067.find(item=>item.id==='pont-chaussee');
    const corridor=nav.bridgeCorridor(c.id,-1);
    const start={x:corridor.approach.x-100,y:corridor.approach.y+72};
    const target={x:corridor.clear.x+300,y:corridor.clear.y-85};
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y);
    const reg=getRegiment(id);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(target.x,target.y,0);
    let steps=0,cleared=false;
    for(;steps<1400;steps++){
      window.RTS_SIM.step(.05);
      if(steps%12)continue;
      const members=regimentMembers(reg).filter(u=>!u.dead);
      if(members.length&&members.every(u=>crossingLocalV068(c,u.x,u.y).along>c.length/2+28)){cleared=true;break;}
    }
    const members=regimentMembers(reg).filter(u=>!u.dead);
    const local=members.map(u=>crossingLocalV068(c,u.x,u.y));
    return{
      cleared,steps,
      members:members.length,
      stranded:local.filter(p=>p.along<=c.length/2+8).length,
      inWater:members.filter(u=>waterAtV067(u.x,u.y)).length,
      minAlong:Math.min(...local.map(p=>p.along)),
      traffic:reg.crossingTrafficV068?.state||null,
      stats:window.__BRIDGE_FOLLOWER_SAFETY_V1__.stats()
    };
  });
  expect(result.members).toBeGreaterThan(12);
  expect(result.cleared).toBe(true);
  expect(result.stranded).toBe(0);
  expect(result.inWater).toBe(0);
  expect(result.minAlong).toBeGreaterThan(143);
  expect(errors).toEqual([]);
});
