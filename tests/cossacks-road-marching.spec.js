const {test,expect}=require('@playwright/test');

test('Cossacks-style infantry column follows road bends four abreast without breaking formation',async({page})=>{
  test.setTimeout(140_000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let seed=27183;
    Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__FOUR_FILE_ROAD_TRAIL_V133__?.fourFileColumn));
  const report=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const road=(window.NRTS_ROAD_NETWORK_V7||ROAD_NETWORK_V066).find(r=>r.id==='route-du-nord');
    if(!road)return{error:'Missing north road'};
    const a=road.points[1],b=road.points[road.points.length-3];
    const members=[];
    for(let i=0;i<36;i++)
      members.push(createUnit('france','infantry',a.x-(i%4-1.5)*15,a.y-(Math.floor(i/4))*18));
    members.push(createUnit('france','officer',a.x+22,a.y));
    members.push(createUnit('france','drummer',a.x+23,a.y-22));
    const reg=createRegiment('france',members);
    if(!reg)return{error:'Could not form regiment'};
    orderGroupPathV06(reg,b.x,b.y,'line',null);
    const plan=reg.routePlanV065;
    const roadRoute=(reg.path||[]).map(p=>({x:p.x,y:p.y}));
    let roadFrames=0,targetOnRoad=0,totalTargets=0,unsafe=0,maxAngleDifference=0,allRanks=0;
    let realOnRoad=0,realTotal=0,meanErrorTotal=0,maxError=0,realColumnFrames=0,realSamples=[];
    let postRoadFrame=0,fieldFrames=0,completed=false,turnSamples=[],modeBreaks=0;
    for(let i=0;i<3600;i++){
      window.RTS_SIM.step(.05);
      const march=reg.marchV063;
      if(!march){completed=true;break;}
      if(reg.crossingTrafficV068?.forcedColumn)continue;
      const onRoad=roadAtV064(march.anchorX,march.anchorY);
      if(onRoad && march.locomotionV064==='road-march'){
        roadFrames++;
        const infantry=members.filter(u=>u.type==='infantry');
        const behind=infantry.filter(u=>Number.isFinite(u.roadTangentV133));
        if(behind.length===36)allRanks++;
        for(const u of behind){
          totalTargets++;
          if(roadNetworkAtV066(u.targetX,u.targetY))targetOnRoad++;
        }
        if(behind.length===36) {
          let frameErrors=0,frameOnRoad=0;
          for(const u of behind) {
            const err=Math.hypot(u.x-u.targetX,u.y-u.targetY);
            meanErrorTotal+=err;maxError=Math.max(maxError,err);
            frameErrors+=err;realTotal++;
            if(roadNetworkAtV066(u.x,u.y)){realOnRoad++;frameOnRoad++;}
          }
          if(frameErrors/36<22 && frameOnRoad>=34)realColumnFrames++;
          if(i%200===0&&realSamples.length<16)
            realSamples.push({time:+elapsed.toFixed(1),frameMeanError:+(frameErrors/36).toFixed(1),
              onRoad:frameOnRoad,anchor:{x:+march.anchorX.toFixed(1),y:+march.anchorY.toFixed(1)},
              first:behind.slice(0,4).map(u=>({x:+u.x.toFixed(1),y:+u.y.toFixed(1),tx:+u.targetX.toFixed(1),ty:+u.targetY.toFixed(1)}))});
        }
        const angles=behind.map(u=>u.roadTangentV133);
        if(angles.length){
          const center=angles[0];
          const difference=Math.max(...angles.map(a=>Math.abs(Math.atan2(Math.sin(a-center),Math.cos(a-center)))));
          if(difference>maxAngleDifference){
            maxAngleDifference=difference;
            if(turnSamples.length<10)turnSamples.push({t:+elapsed.toFixed(1),difference:+difference.toFixed(3),x:+march.anchorX.toFixed(1),y:+march.anchorY.toFixed(1)});
          }
        }
      }else if(onRoad && march.locomotionV064==='field-formation')modeBreaks++;
      else if(!onRoad && march.locomotionV064==='field-formation')fieldFrames++;
      unsafe+=members.filter(u=>waterAtV067(u.x,u.y)).length;
    }
    return{plan,roadRoute,completed,roadFrames,targetOnRoad,totalTargets,
      onRoadTargetShare:totalTargets?targetOnRoad/totalTargets:0,
      allRanks,unsafe,maxAngleDifference,turnSamples,modeBreaks,fieldFrames,
      realOnRoadShare:realTotal?realOnRoad/realTotal:0,meanPhysicalSlotError:realTotal?meanErrorTotal/realTotal:0,
      maxPhysicalSlotError:maxError,realColumnFrames,realSamples,
      trailStats:window.__FOUR_FILE_ROAD_TRAIL_V133__.stats(),
      final:members.map(u=>({id:u.id,dead:u.dead,x:u.x,y:u.y})),
      phase:reg.movementPhaseV063};
  });
  console.log('COSSACKS_ROAD_TRAIL',JSON.stringify({...report,roadRoute:report.roadRoute?.slice(0,18),final:undefined}));
  expect(report.error).toBeUndefined();
  expect(report.plan?.choice).toBe('road');
  expect(report.roadFrames).toBeGreaterThan(100);
  expect(report.allRanks).toBeGreaterThan(100);
  expect(report.onRoadTargetShare).toBeGreaterThan(.80);
  expect(report.maxAngleDifference).toBeGreaterThan(.04);
  expect(report.modeBreaks).toBe(0);
  expect(report.unsafe).toBe(0);
  expect(report.final?.filter(u=>u.dead)).toEqual([]);
  expect(errors).toEqual([]);
});
