const {test,expect}=require('@playwright/test');

test('a full infantry regiment including all 36 soldiers, officer and drummer crosses as one unit',async({page})=>{
  test.setTimeout(150_000);
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(e.message));
  await page.addInitScript(()=>{
    let seed=2731709;
    Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.NRTS_NAVIGATION_V2?.active&&window.__BRIDGE_FOLLOWER_SAFETY_V1__));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const bridge=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const origin=crossingPointV068(bridge,-(bridge.length/2+470),37);
    const destination=crossingPointV068(bridge,bridge.length/2+530,-16);
    const made=[];
    for(let i=0;i<36;i++){
      const p=crossingPointV068(bridge,
        -(bridge.length/2+470)-Math.floor(i/4)*19,
        37+(i%4-1.5)*17);
      made.push(createUnit('france','infantry',p.x,p.y));
    }
    made.push(createUnit('france','officer',origin.x+26,origin.y-13));
    made.push(createUnit('france','drummer',origin.x+26,origin.y+13));
    const reg=createRegiment('france',made);
    if(!reg)return {error:'regiment did not form'};
    const ids=made.map(u=>u.id);
    orderGroupPathV06(reg,destination.x,destination.y,'line',0);
    const routeCrossings=(reg.routeCrossingsV067||[]).map(c=>c.id);
    let maxWater=0,maxBlocked=0,maxBridgeInfantry=0,sawColumn=false,sawBridge=false;
    let fullyClearedAt=null,allArrivedAt=null,firstClearAt=null,maxSpreadAfterClear=0;
    let maxHolderStall=0,holderProgress=null,holderLastAt=elapsed;
    const samples=[];
    for(let i=0;i<6500;i++){
      window.RTS_SIM.step(.05);
      if(i%8)continue;
      const live=made.filter(u=>!u.dead);
      const water=live.filter(u=>waterAtV067(u.x,u.y)).length;
      const blocked=live.filter(u=>Number.isFinite(u.targetX)&&Number.isFinite(u.targetY)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length;
      maxWater=Math.max(maxWater,water);
      maxBlocked=Math.max(maxBlocked,blocked);
      const info=reg.crossingTrafficV068;
      const onBridge=live.filter(u=>crossingPassageContainsV067(bridge,u.x,u.y));
      const infantryOnDeck=onBridge.filter(u=>u.type==='infantry').length;
      maxBridgeInfantry=Math.max(maxBridgeInfantry,infantryOnDeck);
      sawBridge||=infantryOnDeck>0;
      sawColumn||=Boolean(info?.forcedColumn&&['approach','crossing','clearing'].includes(info.state));
      const anchor=reg.marchV063;
      if(info?.state==='crossing'&&anchor){
        const progress=crossingLocalV068(bridge,anchor.anchorX,anchor.anchorY).along;
        if(holderProgress===null||progress>holderProgress+1.5){holderProgress=progress;holderLastAt=elapsed;}
        maxHolderStall=Math.max(maxHolderStall,elapsed-holderLastAt);
      }else{holderProgress=null;holderLastAt=elapsed;}
      const cleared=live.length===ids.length&&live.every(u=>{
        const local=crossingLocalV068(bridge,u.x,u.y);
        return local.along>bridge.length/2+34&&!waterAtV067(u.x,u.y);
      });
      if(cleared&&fullyClearedAt===null){fullyClearedAt=elapsed;firstClearAt=i;}
      if(cleared){
        const center=centroid(live);
        maxSpreadAfterClear=Math.max(maxSpreadAfterClear,...live.map(u=>Math.hypot(u.x-center.x,u.y-center.y)));
      }
      if(i%320===0)samples.push({
        t:+elapsed.toFixed(1),phase:reg.movementPhaseV063,traffic:info?.state||null,
        members:live.length,deck:onBridge.length,water,blocked,
        anchor:anchor?{x:+anchor.anchorX.toFixed(1),y:+anchor.anchorY.toFixed(1)}:null,
        leftBehind:live.filter(u=>u.x<bridge.x).length,
        minX:+Math.min(...live.map(u=>u.x)).toFixed(1),
        maxX:+Math.max(...live.map(u=>u.x)).toFixed(1),
        routeLength:reg.path?.length||0,pathIndex:reg.pathIndex||0
      });
      if(cleared&&reg.movementPhaseV063==='formed'&&!reg.path){
        allArrivedAt=elapsed;break;
      }
    }
    const live=made.filter(u=>!u.dead);
    return {expected:ids.length,actual:live.length,routeCrossings,maxWater,maxBlocked,
      maxBridgeInfantry,sawColumn,sawBridge,fullyClearedAt,allArrivedAt,
      maxSpreadAfterClear,maxHolderStall,samples,
      final:live.map(u=>({id:u.id,type:u.type,x:+u.x.toFixed(1),y:+u.y.toFixed(1),targetX:+u.targetX.toFixed(1),targetY:+u.targetY.toFixed(1)})),
      finalPhase:reg.movementPhaseV063,traffic:reg.crossingTrafficV068?.state||null,
      finalPath:reg.path?.length||0
    };
  });
  console.log('FULL_INFANTRY_BRIDGE_ACCEPTANCE',JSON.stringify({...result,final:result.final?.filter(u=>u.x<1700)}));
  expect(result.error).toBeUndefined();
  expect(result.expected).toBe(38);
  expect(result.actual).toBe(38);
  expect(result.routeCrossings).toContain('pont-chaussee');
  expect(result.sawColumn).toBe(true);
  expect(result.sawBridge).toBe(true);
  expect(result.maxBridgeInfantry).toBeGreaterThanOrEqual(4);
  expect(result.maxWater).toBe(0);
  expect(result.maxBlocked).toBe(0);
  expect(result.maxHolderStall).toBeLessThan(22);
  expect(result.fullyClearedAt,JSON.stringify(result.samples)).not.toBeNull();
  expect(result.allArrivedAt,JSON.stringify(result.samples)).not.toBeNull();
  expect(result.final.every(u=>u.x>bridgeFarEdge())).toBe(true);
  expect(pageErrors).toEqual([]);
  function bridgeFarEdge(){return 1500+135+34;}
});
