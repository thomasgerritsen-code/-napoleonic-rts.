const { test, expect } = require('@playwright/test');

async function openTraffic(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.RTS_SIM && window.__RTS_DEBUG__ && window.__FORMATION_TRAFFIC_V1__ && window.__BRIDGE_FORMATION_FLOW_V1__
  ));
  await page.evaluate(()=>window.__RTS_DEBUG__.setPeaceMode(true));
  return errors;
}

function laneFinderSource(){
  return () => {
    for(let y=380;y<WORLD.height-380;y+=90){
      for(let x=420;x<WORLD.width-1200;x+=110){
        let ok=true;
        for(let s=0;s<=10;s++){
          const px=x+s*85;
          if(waterAtV067(px,y)||roadNetworkAtV066(px,y)){ok=false;break;}
        }
        if(ok)return{x,y};
      }
    }
    return{x:650,y:850};
  };
}

test('a moving line keeps actively forming instead of dissolving into loose soldiers',async({page})=>{
  const errors=await openTraffic(page);
  const result=await page.evaluate(findLane=>{
    const start=(0,eval)(`(${findLane})`)();
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y);
    const reg=getRegiment(id);

    // Deliberately disturb several files: the moving battalion should close these gaps
    // while still advancing instead of waiting motionless for a perfect parade line.
    regimentMembers(reg).filter(u=>u.type==='infantry').slice(0,4).forEach((u,i)=>{
      u.x-=18+i*4;
      u.y+=34+i*5;
    });

    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(start.x+720,start.y,0);
    const before=centroid(regimentMembers(reg));
    window.RTS_SIM.step(5.0);
    const after=centroid(regimentMembers(reg));
    const members=regimentMembers(reg).filter(u=>!u.dead);
    const facing=reg.marchV063?.marchFacing??reg.facing??0;
    const c=Math.cos(facing),s=Math.sin(facing);
    const local=members.map(u=>{
      const dx=u.x-after.x,dy=u.y-after.y;
      return{forward:dx*c+dy*s,lateral:-dx*s+dy*c};
    });
    return{
      progress:Math.hypot(after.x-before.x,after.y-before.y),
      readiness:formationReadinessV063(reg,28),
      lateralSpan:Math.max(...local.map(p=>p.lateral))-Math.min(...local.map(p=>p.lateral)),
      forwardSpan:Math.max(...local.map(p=>p.forward))-Math.min(...local.map(p=>p.forward)),
      formation:reg.formation,
      phase:reg.movementPhaseV063,
      stats:window.__FORMATION_TRAFFIC_V1__.stats()
    };
  },laneFinderSource().toString());
  expect(result.formation).toBe('line');
  expect(result.progress).toBeGreaterThan(45);
  expect(result.readiness).toBeGreaterThan(.55);
  expect(result.lateralSpan).toBeGreaterThan(65);
  expect(result.forwardSpan).toBeLessThan(105);
  expect(result.stats.cohesionSlowdowns).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('two friendly lines moving toward each other choose passing lanes instead of deadlocking',async({page})=>{
  const errors=await openTraffic(page);
  const result=await page.evaluate(findLane=>{
    const start=(0,eval)(`(${findLane})`)();
    const idA=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y-45);
    const idB=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x+560,start.y+45);
    const a=getRegiment(idA),b=getRegiment(idB);
    orderGroupPathV06(a,start.x+760,start.y+20,'line',0);
    orderGroupPathV06(b,start.x-200,start.y-20,'line',Math.PI);
    const initialA=centroid(regimentMembers(a)),initialB=centroid(regimentMembers(b));
    let crossed=false;

    // Use fewer, larger deterministic simulation advances so this remains a fast
    // regression while still covering the whole head-on encounter.
    for(let i=0;i<90;i++){
      window.RTS_SIM.step(.15);
      if(i%2)continue;
      const ca=centroid(regimentMembers(a)),cb=centroid(regimentMembers(b));
      if(ca.x>cb.x){crossed=true;break;}
    }
    const ca=centroid(regimentMembers(a)),cb=centroid(regimentMembers(b));
    return{
      crossed,
      travelA:Math.hypot(ca.x-initialA.x,ca.y-initialA.y),
      travelB:Math.hypot(cb.x-initialB.x,cb.y-initialB.y),
      separation:Math.hypot(ca.x-cb.x,ca.y-cb.y),
      stats:window.__FORMATION_TRAFFIC_V1__.stats()
    };
  },laneFinderSource().toString());
  expect(result.stats.passingPairs).toBeGreaterThan(0);
  expect(result.travelA).toBeGreaterThan(100);
  expect(result.travelB).toBeGreaterThan(100);
  expect(result.crossed).toBe(true);
  expect(result.separation).toBeGreaterThan(25);
  expect(errors).toEqual([]);
});

test('bridge traffic is compressed before follower water safety takes over',async({page})=>{
  const errors=await openTraffic(page);
  const result=await page.evaluate(()=>{
    const c=WATER_CROSSINGS_V067.find(item=>item.id==='pont-chaussee');
    const initialSide=-1;
    const start=crossingPointV068(c,initialSide*(c.length/2+130),0);
    const exit=crossingPointV068(c,-initialSide*(c.length/2+180),0);
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y);
    const reg=getRegiment(id);
    orderGroupPathV06(reg,exit.x,exit.y,'line',crossingHeadingV068(c,initialSide));
    const info={crossingId:c.id,crossingName:c.name,state:'crossing',queuePosition:0,initialSide,entered:true,forcedColumn:true};
    reg.crossingTrafficV068=info;
    reg.marchV063.anchorX=c.x;
    reg.marchV063.anchorY=c.y;
    forceBridgeColumnTargetsV068(reg,reg.marchV063,info);
    const members=regimentMembers(reg).filter(u=>!u.dead);
    const targetLocal=members.map(u=>crossingLocalV068(c,u.targetX,u.targetY));
    return{
      maxPerp:Math.max(...targetLocal.map(p=>Math.abs(p.perp))),
      halfWidth:c.width/2,
      blocked:members.filter(u=>segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length,
      flow:window.__BRIDGE_FORMATION_FLOW_V1__.stats()
    };
  });
  expect(result.flow.applications).toBeGreaterThan(0);
  expect(result.maxPerp).toBeLessThan(result.halfWidth);
  expect(result.blocked).toBe(0);
  expect(errors).toEqual([]);
});
