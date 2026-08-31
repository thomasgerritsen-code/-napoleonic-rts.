const { test, expect } = require('@playwright/test');

async function openGame(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let seed=246813579;Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};});
  await page.goto('/?test=building-avoidance',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM?.step&&window.__GAMEPLAY_BUILDING_ROUTING_V1__&&window.__STUCK_RECOVERY_V2__&&window.__VILLAGE_NAVIGATION_V7__));
  return errors;
}

test('infantry, cavalry and artillery route around gameplay buildings without stalls',async({page})=>{
  const errors=await openGame(page);
  const result=await page.evaluate(()=>{
    window.__RTS_DEBUG__?.setPeaceMode?.(true);

    function lane(){
      const village=window.__VILLAGE_NAVIGATION_V7__;
      for(let y=260;y<=1900;y+=100){
        const start={x:760,y},goal={x:1320,y};
        if(waterAtV067(start.x,start.y)||waterAtV067(goal.x,goal.y))continue;
        if(segmentCrossesBlockedWaterV067(start.x,start.y,goal.x,goal.y))continue;
        if(!village.pathClear(start,[goal],'artillery'))continue;
        const blocked=buildings.some(b=>!b.dead&&Math.abs(b.x-1040)<(b.w*.5+90)&&Math.abs(b.y-y)<(b.h*.5+90));
        if(!blocked)return{start,goal,building:{x:1040,y}};
      }
      throw new Error('No open left-bank test lane found');
    }
    function makeGroup(kind,start){
      const made=[];
      if(kind==='infantry'){
        for(let i=0;i<12;i++)made.push(createUnit('france','infantry',start.x+(i%4)*10,start.y+Math.floor(i/4)*10));
        made.push(createUnit('france','officer',start.x-14,start.y-12));
        made.push(createUnit('france','drummer',start.x-14,start.y+12));
        return createRegiment('france',made,`Building ${kind}`);
      }
      if(kind==='cavalry'){
        for(let i=0;i<6;i++)made.push(createUnit('france','cavalry',start.x+(i%3)*14,start.y+Math.floor(i/3)*16));
        made.push(createUnit('france','officer',start.x-18,start.y));
        return createCavalryRegimentV06('france',made,`Building ${kind}`);
      }
      const cannon=createUnit('france','artillery',start.x,start.y);
      const crew=[createUnit('france','infantry',start.x-12,start.y+20),createUnit('france','infantry',start.x+12,start.y+20)];
      return createArtilleryBatteryV06('france',cannon,crew,`Building ${kind}`);
    }
    function insideBuilding(u,b,pad=2){return Math.abs(u.x-b.x)<b.w*.5+(TYPES[u.type]?.radius||6)+pad&&Math.abs(u.y-b.y)<b.h*.5+(TYPES[u.type]?.radius||6)+pad;}

    const cases=[];
    for(const kind of ['infantry','cavalry','artillery']){
      resetGame();window.__RTS_DEBUG__?.setPeaceMode?.(true);
      const testLane=lane();
      const b=createBuilding('britain','barracks',testLane.building.x,testLane.building.y,true);
      const reg=makeGroup(kind,testLane.start);
      if(!reg)throw new Error(`Could not create ${kind} test group`);
      const startCenter=centroid(regimentMembers(reg));
      orderGroupPathV06(reg,testLane.goal.x,testLane.goal.y,'line',0);
      const initialPath=(reg.path||[]).slice();
      let cursor={x:reg.marchV063?.anchorX??startCenter.x,y:reg.marchV063?.anchorY??startCenter.y};
      let blockedSegments=0;
      for(const p of initialPath){if(window.__GAMEPLAY_BUILDING_ROUTING_V1__.segmentBlocked(cursor,p,kind))blockedSegments++;cursor=p;}

      let previous=centroid(regimentMembers(reg)),maxStill=0,still=0,penetrations=0,minProgress=0;
      for(let i=0;i<1200;i++){
        window.RTS_SIM.step(.05);
        const members=regimentMembers(reg);
        penetrations+=members.filter(u=>insideBuilding(u,b)).length;
        if(i%20===19){
          const c=centroid(members),moved=Math.hypot(c.x-previous.x,c.y-previous.y),remaining=Math.hypot(testLane.goal.x-c.x,testLane.goal.y-c.y);
          if(moved<2&&remaining>110)still+=1;else still=0;
          maxStill=Math.max(maxStill,still);minProgress=Math.max(minProgress,Math.hypot(c.x-startCenter.x,c.y-startCenter.y));previous=c;
        }
      }
      const end=centroid(regimentMembers(reg));
      cases.push({kind,rerouted:!!reg.gameplayBuildingRouteV1?.rerouted,pathLength:initialPath.length,blockedSegments,remaining:+Math.hypot(testLane.goal.x-end.x,testLane.goal.y-end.y).toFixed(1),maxStillSeconds:maxStill,penetrations,progress:+minProgress.toFixed(1),routeStats:window.__GAMEPLAY_BUILDING_ROUTING_V1__.stats()});
    }
    return{cases,errors:[]};
  });

  for(const c of result.cases){
    expect(c.rerouted,`${c.kind} route should be rerouted`).toBe(true);
    expect(c.pathLength,`${c.kind} should receive a route`).toBeGreaterThan(1);
    expect(c.blockedSegments,`${c.kind} route must not cross building footprint`).toBe(0);
    expect(c.penetrations,`${c.kind} units must not enter building footprint`).toBe(0);
    expect(c.maxStillSeconds,`${c.kind} must not remain stuck against building`).toBeLessThan(5);
    expect(c.progress,`${c.kind} should make substantial progress`).toBeGreaterThan(350);
    expect(c.remaining,`${c.kind} should reach the far side`).toBeLessThan(115);
  }
  expect(errors).toEqual([]);
});
