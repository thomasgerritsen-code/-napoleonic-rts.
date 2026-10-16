const { test, expect } = require('@playwright/test');

test('normal player-made regiment obeys road march rather than only synthetic test regiments', async ({page})=>{
  test.setTimeout(150000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=3d',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM && window.__OFFICER_REGIMENT_MOBILE_V1__ &&
    window.__FOUR_FILE_ROAD_TRAIL_V133__ && window.__BATTLEFIELD_3D_V1__?.enabled?.()));
  const before=await page.evaluate(()=>{
    // Isolate a player's march from legitimate enemy combat and routing.
    // Golden Battle separately checks engagement and morale.
    for(const u of units)if(u.side==='britain')u.dead=true;
    for(const reg of regiments)if(reg.side==='britain')reg.destroyed=true;
    const officer=freeUnits('france','officer')[0];
    if(!officer)return{error:'No free officer'};
    selectedUnits.clear();
    selectedUnits.add(officer);
    actionSignature='';
    updateHud(true);
    const draft=window.__OFFICER_REGIMENT_MOBILE_V1__.draft();
    return{officer:officer.id,draft:{canCreate:draft?.canCreate,infantry:draft?.infantryIds?.length,
      drummerId:draft?.drummerId},button:!document.querySelector('#actions [data-action="create-regiment"]')?.disabled};
  });
  expect(before.error).toBeUndefined();
  expect(before.draft?.canCreate).toBe(true);
  await page.locator('#actions [data-action="create-regiment"]').click();
  const results=await page.evaluate(()=>{
    const reg=selectedRegiments()[0];
    if(!reg)return{error:'No player regiment selected after clicking create'};
    const start=centroid(regimentMembers(reg));
    const road=(window.NRTS_ROAD_NETWORK_V7||ROAD_NETWORK_V066).find(r=>r.id==='grande-chaussee');
    const destination=road.points[road.points.length-3];
    issueMoveWithFacingV06(destination.x,destination.y,null);
    const planned={...reg.routePlanV065};
    const routeRoads=reg.routeRoadsV066?.map(r=>r.id);
    const path=(reg.path||[]).map(p=>({x:p.x,y:p.y}));
    const infantry=regimentMembers(reg).filter(u=>u.type==='infantry');
    let roadFrames=0,fourFileFrames=0,inside=0,total=0,unsafe=0,maxSpread=0;
    let realSlotError=0,realSlotCount=0,cohesiveFrames=0;
    const positions=[],timeline=[];
    let firstArrival=null,orderChanges=0,lastTarget=JSON.stringify(reg.finalTarget),minLiving=infantry.length;
    for(let i=0;i<3800;i++){
      window.RTS_SIM.step(.05);
      const changed=JSON.stringify(reg.finalTarget);
      if(changed!==lastTarget){orderChanges++;lastTarget=changed;}
      minLiving=Math.min(minLiving,infantry.filter(u=>!u.dead).length);
      if(i%100===0)timeline.push({t:+elapsed.toFixed(1),phase:reg.movementPhaseV063,
        anchor:reg.marchV063?{x:+reg.marchV063.anchorX.toFixed(1),y:+reg.marchV063.anchorY.toFixed(1)}:null,
        centroid:centroid(infantry),finalTarget:reg.finalTarget,routeChoice:reg.routePlanV065?.choice,
        pathIndex:reg.pathIndex,pathLength:reg.path?.length||0,alive:infantry.filter(u=>!u.dead).length,
        engagement:reg.engagementV069?.mode||null});
      const march=reg.marchV063;
      if(!march && firstArrival===null)firstArrival=elapsed;
      if(!march)break;
      if(march.locomotionV064!=='road-march'||!roadAtV064(march.anchorX,march.anchorY)||
         reg.crossingTrafficV068?.forcedColumn)continue;
      roadFrames++;
      const center=centroid(infantry);
      const spread=Math.max(...infantry.map(u=>Math.hypot(u.x-center.x,u.y-center.y)));
      maxSpread=Math.max(maxSpread,spread);
      const slots=infantry.map(u=>marchColumnOffsetsV063(reg).get(u.id)).filter(Boolean);
      if(slots.length===infantry.length && new Set(slots.map(s=>s.oy)).size===4)fourFileFrames++;
      const frameError=infantry.reduce((sum,u)=>sum+Math.hypot(u.x-u.targetX,u.y-u.targetY),0)/infantry.length;
      if(frameError<22)cohesiveFrames++;
      realSlotError+=frameError;realSlotCount++;
      for(const u of infantry){
        total++;
        if(roadNetworkAtV066(u.x,u.y))inside++;
        if(waterAtV067(u.x,u.y))unsafe++;
      }
      if(i%400===0&&positions.length<10)positions.push({
        t:+elapsed.toFixed(1),anchor:{x:+march.anchorX.toFixed(1),y:+march.anchorY.toFixed(1)},
        real:infantry.map(u=>({x:+u.x.toFixed(1),y:+u.y.toFixed(1)})),
        target:infantry.map(u=>({x:+u.targetX.toFixed(1),y:+u.targetY.toFixed(1)}))
      });
    }
    return{origin:start,head:reg.id,infantry:infantry.length,planned,routeRoads,path:path.slice(0,24),
      timeline:timeline.slice(0,23),firstArrival,orderChanges,minLiving,finalTarget:reg.finalTarget,
      roadFrames,fourFileFrames,onRoadShare:total?inside/total:0,unsafe,maxSpread,
      meanActualSlotError:realSlotCount?realSlotError/realSlotCount:0,cohesiveFrames,
      ended:!reg.marchV063,mode:document.documentElement.dataset.renderMode,
      positions,
      finalPositions:infantry.map(u=>({x:+u.x.toFixed(1),y:+u.y.toFixed(1)}))
    };
  });
  console.log('REAL_PLAYER_3D_ROAD_MARCH',JSON.stringify({...results,positions:results.positions.slice(0,2),finalPositions:results.finalPositions.slice(0,4)}));
  expect(results.error).toBeUndefined();
  expect(results.infantry).toBe(12);
  expect(results.roadFrames).toBeGreaterThan(40);
  expect(results.firstArrival,JSON.stringify(results.timeline)).not.toBeNull();
  expect(results.orderChanges,JSON.stringify(results.timeline)).toBe(0);
  expect(results.fourFileFrames).toBeGreaterThan(40);
  expect(results.minLiving).toBe(results.infantry);
  expect(results.onRoadShare).toBeGreaterThan(.90);
  expect(results.cohesiveFrames).toBeGreaterThan(70);
  expect(results.meanActualSlotError).toBeLessThan(20);
  expect(results.onRoadShare).toBeGreaterThan(.70);
  expect(results.unsafe).toBe(0);
  expect(errors).toEqual([]);
});
