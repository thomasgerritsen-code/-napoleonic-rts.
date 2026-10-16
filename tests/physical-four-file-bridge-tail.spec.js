const {test,expect}=require('@playwright/test');

async function openGame(page) {
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM && window.__RTS_DEBUG__ &&
    window.__COLUMN_COHESION_V250__ && window.__BRIDGE_FORMATION_FLOW_V1__));
  return errors;
}

test('a released bridge reservation retains safe follower guidance for a soldier on the entry bank',async({page})=>{
  const errors=await openGame(page);
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const c=WATER_CROSSINGS_V067.find(x=>x.id==='pont-chaussee');
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1180,900);
    const reg=getRegiment(id);
    orderGroupPathV06(reg,1950,900,'line',null);
    const members=regimentMembers(reg).filter(u=>!u.dead);
    const straggler=members.find(u=>u.type==='infantry');
    const state=CROSSING_TRAFFIC_V068.get(c.id);
    // The group anchor and almost all members have reached the opposite bank,
    // but a real musketier remains on the entry bank, as in the screenshot.
    members.forEach((u,i)=>{
      const p=crossingPointV068(c,c.length/2+85,(i%4-1.5)*15);
      u.x=p.x;u.y=p.y;
    });
    const near=crossingPointV068(c,-c.length/2-62,16);
    straggler.x=near.x;straggler.y=near.y;
    reg.marchV063.anchorX=c.x+c.length/2+115;
    reg.marchV063.anchorY=c.y;
    reg.marchV063.marchFacing=c.angle;
    reg.crossingTrafficV068={
      crossingId:c.id,crossingName:c.name,
      state:'crossing',queuePosition:0,initialSide:-1,entered:true,forcedColumn:true
    };
    state.queue=[];state.holderIds=[reg.id];
    updateHolderStateV068(reg,reg.marchV063,reg.crossingTrafficV068,c);
    // Deadlock-avoidance is allowed to release the logical lane while a
    // straggler remains behind. That soldier MUST retain physical guidance
    // to the correct crossing until he personally reaches dry far-side ground.
    const followerRememberedCrossing=straggler.bridgeLastCrossingV1?.crossingId===c.id;
    const followerTargetIsSafe=!segmentCrossesBlockedWaterV067(
      straggler.x,straggler.y,straggler.targetX,straggler.targetY);
    const phaseBefore=reg.movementPhaseV063;
    // Only then physically move the final rear soldier across the far portal
    // to prove the reservation has a finite and correct release condition.
    const far=crossingPointV068(c,c.length/2+95,15);
    straggler.x=far.x;straggler.y=far.y;
    updateHolderStateV068(reg,reg.marchV063,reg.crossingTrafficV068,c);
    return{followerRememberedCrossing,followerTargetIsSafe,phaseBefore,releasedAfterEveryMember:
      !state.holderIds.includes(reg.id) &&
      reg.crossingTrafficV068?.state==='clearing',
      living:members.length,stragglerType:straggler.type};
  });
  console.log('BRIDGE_TAIL_RELEASE_250',JSON.stringify(result));
  expect(result.living).toBeGreaterThanOrEqual(14);
  expect(result.stragglerType).toBe('infantry');
  expect(result.followerRememberedCrossing).toBe(true);
  expect(result.followerTargetIsSafe).toBe(true);
  expect(result.releasedAfterEveryMember).toBe(true);
  expect(errors).toEqual([]);
});

test('real screenshot scenario: a displaced rear soldier catches up before the four-file bridge column is released',async({page})=>{
  test.setTimeout(160000);
  const errors=await openGame(page);
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const c=WATER_CROSSINGS_V067.find(x=>x.id==='pont-chaussee');
    const start=crossingPointV068(c,-c.length/2-340,0);
    const members=[];
    for(let i=0;i<12;i++)
      members.push(createUnit('france','infantry',start.x+(i%6)*16,start.y+(Math.floor(i/6)-.5)*17));
    members.push(createUnit('france','officer',start.x+14,start.y-23));
    members.push(createUnit('france','drummer',start.x+14,start.y+23));
    const reg=createRegiment('france',members);
    if(!reg)return{error:'regiment failed'};
    selectWholeRegiment(reg);
    issueMoveWithFacingV06(2040,c.y,null);
    let displaced=false,earlyRelease=false,firstCrossing=null,allArrived=false,
      releasedAt=null,stagedFourFiles=false,maxWater=0,minDeckMembers=0,tailLagMax=0;
    let physicallyAlignedDeckFrames=0,maxDeckInfantry=0;
    const samples=[];
    for(let i=0;i<3600;i++){
      window.RTS_SIM.step(.05);
      if(i%4)continue;
      const march=reg.marchV063;
      const info=reg.crossingTrafficV068;
      if(info?.forcedColumn && march?.slotOffsetsV064){
        const m=members.filter(u=>u.type==='infantry').map(u=>march.slotOffsetsV064.get(u.id));
        if(m.every(Boolean) && new Set(m.map(x=>Math.round(x.oy))).size===4)stagedFourFiles=true;
      }
      // Physically disrupt one rear rank after the bridge column has entered.
      // The live controllers must regroup that soldier without dropping lane
      // authority or allowing a new battalion to enter early.
      if(!displaced && info?.state==='crossing' && march?.anchorX>c.x+35){
        const soldier=members.find(u=>u.type==='infantry');
        const near=crossingPointV068(c,-c.length/2-58,20);
        soldier.x=near.x;soldier.y=near.y;
        displaced=true;
      }
      const stillBehind=members.some(u=>!u.dead &&
        crossingLocalV068(c,u.x,u.y).along<c.length/2+24);
      if(displaced && stillBehind && info?.state==='clearing')earlyRelease=true;
      if(displaced && !stillBehind && !releasedAt)releasedAt=elapsed;
      const deck=members.filter(u=>crossingPassageContainsV067(c,u.x,u.y)).length;
      if(deck>0)firstCrossing ??= elapsed;
      minDeckMembers=Math.max(minDeckMembers,deck);
      const onDeckInfantry=members.filter(u=>u.type==='infantry' &&
        crossingPassageContainsV067(c,u.x,u.y));
      maxDeckInfantry=Math.max(maxDeckInfantry,onDeckInfantry.length);
      if(onDeckInfantry.length>=8){
        const laneOffsets=[-22.5,-7.5,7.5,22.5];
        const aligned=onDeckInfantry.filter(u=>{
          const perp=crossingLocalV068(c,u.x,u.y).perp;
          return laneOffsets.some(lane=>Math.abs(perp-lane)<=8);
        }).length;
        const lanes=new Set(onDeckInfantry.map(u=>{
          const perp=crossingLocalV068(c,u.x,u.y).perp;
          return laneOffsets.reduce((best,lane,i)=>
            Math.abs(perp-lane)<Math.abs(perp-laneOffsets[best])?i:best,0);
        }));
        if(aligned>=8 && lanes.size===4)physicallyAlignedDeckFrames++;
      }
      maxWater=Math.max(maxWater,members.filter(u=>waterAtV067(u.x,u.y)).length);
      if(i%200===0 && samples.length<30)samples.push({
        t:+elapsed.toFixed(1),state:info?.state||null,
        anchor:march?{x:+march.anchorX.toFixed(1),y:+march.anchorY.toFixed(1)}:null,
        left:members.filter(u=>u.x<c.x-c.length/2).length,
        right:members.filter(u=>u.x>c.x+c.length/2+24).length,deck
      });
      if(displaced && !march && !members.some(u=>!u.dead&&u.x<c.x+c.length/2+24)){
        allArrived=true;break;
      }
    }
    return{displaced,earlyRelease,firstCrossing,allArrived,releasedAt,
      stagedFourFiles,maxWater,minDeckMembers,physicallyAlignedDeckFrames,maxDeckInfantry,samples,
      final:members.map(u=>({x:u.x,y:u.y,dead:u.dead,type:u.type})),
      stats:window.__COLUMN_COHESION_V250__.stats()};
  });
  console.log('SCREENSHOT_REGIMENT_COHESION_250',JSON.stringify({...result,final:undefined}));
  expect(result.error).toBeUndefined();
  expect(result.displaced).toBe(true);
  expect(result.stagedFourFiles).toBe(true);
  expect(result.maxDeckInfantry).toBeGreaterThanOrEqual(8);
  expect(result.physicallyAlignedDeckFrames).toBeGreaterThan(0);
  expect(result.firstCrossing).not.toBeNull();
  expect(result.earlyRelease).toBe(false);
  expect(result.releasedAt).not.toBeNull();
  expect(result.allArrived).toBe(true);
  expect(result.maxWater).toBe(0);
  expect(result.final.filter(x=>x.dead)).toEqual([]);
  expect(errors).toEqual([]);
});
