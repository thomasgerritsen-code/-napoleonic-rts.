const { test, expect } = require('@playwright/test');

test('gun with two escorts shares bridge reservation with an opposing battery', async ({ page }) => {
  test.setTimeout(120_000);
  const errors=[];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    let seed=331170;
    Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.__RTS_DEBUG__?.setPeaceMode));
  const result=await page.evaluate(() => {
    resetGame();
    window.__RTS_DEBUG__.setPeaceMode(true);
    gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const bridge=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const makeBattery=side=>{
      const start=crossingPointV068(bridge,side*(bridge.length/2+270),0);
      const finish=crossingPointV068(bridge,-side*(bridge.length/2+340),0);
      const gun=createUnit('france','artillery',start.x,start.y);
      const crew=[createUnit('france','infantry',start.x-15,start.y-22),
                  createUnit('france','infantry',start.x-15,start.y+22)];
      const reg=createArtilleryBatteryV06('france',gun,crew);
      if(!reg)return {error:'battery creation failed'};
      orderGroupPathV06(reg,finish.x,finish.y,'line',crossingHeadingV068(bridge,side));
      return {id:reg.id,gun,crew,reg,side,route:(reg.routeCrossingsV067||[]).map(c=>c.id)};
    };
    const first=makeBattery(-1),second=makeBattery(1);
    if(first.error||second.error)return {error:first.error||second.error};
    if(!first.reg.path||!second.reg.path)return {error:'missing battery paths'};
    const queue=[];
    let maxHolders=0,waiting=false,firstEntered=false,secondEntered=false;
    let maxWater=0,maxDeckOccupants=0,cleared=[];
    for(let i=0;i<5000;i++){
      window.RTS_SIM.step(.05);
      if(i%8)continue;
      const traffic=CROSSING_TRAFFIC_V068.get(bridge.id);
      maxHolders=Math.max(maxHolders,traffic.holderIds.length);
      const current=[first,second];
      waiting ||=current.some(s=>s.reg.crossingTrafficV068?.state==='waiting');
      firstEntered ||=first.reg.crossingTrafficV068?.state==='crossing';
      secondEntered ||=second.reg.crossingTrafficV068?.state==='crossing';
      let occupying=0;
      for(const s of current){
        const members=regimentMembers(s.reg).filter(u=>!u.dead);
        const onDeck=members.some(u=>crossingPassageContainsV067(bridge,u.x,u.y));
        if(onDeck)occupying++;
        maxWater=Math.max(maxWater,members.filter(u=>waterAtV067(u.x,u.y)).length);
        if(!cleared.includes(s.id) && members.length===3 && members.every(u=>{
          const local=crossingLocalV068(bridge,u.x,u.y);
          return local.along*-s.side>bridge.length/2+28;
        }))cleared.push(s.id);
      }
      maxDeckOccupants=Math.max(maxDeckOccupants,occupying);
      if(queue.length<12 && i%160===0)queue.push({t:+elapsed.toFixed(1),holders:[...traffic.holderIds],waiting:traffic.queue.length,
        gunPositions:current.map(s=>({x:+s.gun.x.toFixed(1),y:+s.gun.y.toFixed(1),state:s.reg.crossingTrafficV068?.state||null}))});
      if(cleared.length===2)break;
    }
    return {routes:[first.route,second.route],queue,waiting,maxHolders,maxDeckOccupants,maxWater,
      firstEntered,secondEntered,cleared,
      final:[first,second].map(s=>({id:s.id,side:s.side,gun:{x:s.gun.x,y:s.gun.y},
        crew:s.crew.map(u=>({x:u.x,y:u.y,dead:u.dead})),
        remaining:s.reg.path?.length||0,traffic:s.reg.crossingTrafficV068?.state||null}))};
  });
  console.log('ARTILLERY_BRIDGE_TRAFFIC', JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.routes.every(route=>route.includes('pont-chaussee'))).toBe(true);
  expect(result.waiting).toBe(true);
  expect(result.maxHolders).toBeLessThanOrEqual(1);
  expect(result.maxDeckOccupants).toBeLessThanOrEqual(1);
  expect(result.maxWater).toBe(0);
  expect(result.firstEntered).toBe(true);
  expect(result.secondEntered).toBe(true);
  expect(result.cleared).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('artillery angled bridge approach continues along the selected crossing route', async ({page}) => {
  test.setTimeout(90_000);
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM && window.NRTS_NAVIGATION_V2?.active));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const c=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const start=crossingPointV068(c,-(c.length/2+210),18);
    const destination=crossingPointV068(c,c.length/2+210,-6.3);
    const gun=createUnit('france','artillery',start.x,start.y);
    const crew=[createUnit('france','infantry',start.x-25,start.y-14),
      createUnit('france','infantry',start.x-25,start.y+14)];
    const reg=createArtilleryBatteryV06('france',gun,crew);
    orderGroupPathV06(reg,destination.x,destination.y,'column',c.angle);
    const initial={x:gun.x,y:gun.y,path:(reg.path||[]).slice(0,8),routeCrossings:reg.routeCrossingsV067};
    const snapshots=[];
    for(let i=0;i<250;i++){
      window.RTS_SIM.step(.05);
      if([0,15,50,100,200,249].includes(i))snapshots.push({
        t:+elapsed.toFixed(2),x:+gun.x.toFixed(2),y:+gun.y.toFixed(2),
        targetX:+gun.targetX.toFixed(2),targetY:+gun.targetY.toFixed(2),
        pathIndex:reg.pathIndex,holderIds:CROSSING_TRAFFIC_V068.get(c.id).holderIds.slice(),
        traffic:reg.crossingTrafficV068?.state||null,hold:reg.artilleryBridgeHoldV068||false,
        crewApproach:reg.crewApproachV1?.active,crewDist:crew.map(u=>+Math.hypot(u.x-gun.x,u.y-gun.y).toFixed(1))
      });
    }
    return {initial,snapshots,moved:Math.hypot(gun.x-start.x,gun.y-start.y),
      water:regimentMembers(reg).filter(u=>waterAtV067(u.x,u.y)).length};
  });
  console.log('ARTILLERY_ANGLED_DIAGNOSTIC',JSON.stringify(result));
  expect(result.moved).toBeGreaterThan(70);
  expect(result.water).toBe(0);
  expect(errors).toEqual([]);
});
