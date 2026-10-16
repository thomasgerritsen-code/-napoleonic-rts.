const {test,expect}=require('@playwright/test');

test('iPhone bridge approach: a player regiment forms four readable ranks before Pont de la Chaussee', async({page})=>{
  test.setTimeout(120000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__BRIDGE_FORMATION_FLOW_V1__));
  const result=await page.evaluate(()=>{
    resetGame();window.__RTS_DEBUG__.setPeaceMode(true);gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const crossing=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const made=[];
    // A regiment initially spread into a shallow line near the bridge,
    // matching the player's screenshot rather than the old idealized spawn.
    for(let i=0;i<12;i++) made.push(createUnit('france','infantry',1150+(i%6)*20,877+Math.floor(i/6)*25));
    made.push(createUnit('france','officer',1120,880));
    made.push(createUnit('france','drummer',1120,917));
    const reg=createRegiment('france',made);
    if(!reg)return{error:'could not form regiment'};
    selectWholeRegiment(reg);
    issueMoveWithFacingV06(2050,900,null);
    const infantry=made.filter(u=>u.type==='infantry');
    let peakError=0,maxWater=0,firstBridge=null,stageSamples=0,goodStages=0,stagedAt=null,arrivedAt=null;
    let firstStagingFourFiles=null,firstStagingError=null,stagingDelayFrames=0;
    const samples=[];
    for(let i=0;i<3300;i++){
      window.RTS_SIM.step(.05);
      if(i%10)continue;
      const march=reg.marchV063;
      const info=reg.crossingTrafficV068;
      const local=march?crossingLocalV068(crossing,march.anchorX,march.anchorY):null;
      const current=made.filter(u=>!u.dead);
      maxWater=Math.max(maxWater,current.filter(u=>waterAtV067(u.x,u.y)).length);
      if(march && (info?.forcedColumn || march.locomotionV064==='road-march')){
        const soldierError=infantry.map(u=>Math.hypot(u.x-u.targetX,u.y-u.targetY));
        const meanError=soldierError.reduce((a,b)=>a+b,0)/soldierError.length;
        peakError=Math.max(peakError,meanError);
        const offsets=march.slotOffsetsV064||new Map();
        const slots=infantry.map(u=>offsets.get(u.id));
        const fourFiles=slots.every(Boolean)&&new Set(slots.map(o=>Math.round(o.oy*10)/10)).size===4;
        const inStaging=info?.forcedColumn && local && local.along<-(crossing.length/2+30)&&local.along>-(crossing.length/2+180);
        if(inStaging){
          stageSamples++;
          if(firstStagingFourFiles===null){firstStagingFourFiles=fourFiles;firstStagingError=meanError;}
          if(meanError<22&&fourFiles)goodStages++;
          if(!stagedAt&&meanError<22&&fourFiles)stagedAt=elapsed;
          if(march.speedV064<=6)stagingDelayFrames++;
        }
        if(!firstBridge&&current.some(u=>crossingPassageContainsV067(crossing,u.x,u.y)))firstBridge=elapsed;
        if(i%100===0&&samples.length<30) samples.push({t:+elapsed.toFixed(1),phase:march.phase,traffic:info?.state||null,
          x:+march.anchorX.toFixed(1),locomotion:march.locomotionV064,meanError:+meanError.toFixed(1),fourFiles,
          real:infantry.map(u=>({x:+u.x.toFixed(1),y:+u.y.toFixed(1)})),
          ideal:infantry.map(u=>({x:+u.targetX.toFixed(1),y:+u.targetY.toFixed(1)}))});
      }
      if(!march){arrivedAt=elapsed;break;}
    }
    return{count:made.length,alive:made.filter(u=>!u.dead).length,maxWater,
      peakError,stageSamples,goodStages,stagedAt,firstStagingFourFiles,firstStagingError,stagingDelayFrames,
      firstBridge,arrivedAt,samples,
      final:made.map(u=>({id:u.id,type:u.type,x:u.x,y:u.y,dead:u.dead}))};
  });
  console.log('IPHONE_BRIDGE_APPROACH_249',JSON.stringify({...result,final:undefined,samples:result.samples.map(s=>({...s,real:s.real.slice(0,4),ideal:s.ideal.slice(0,4)}))}));
  expect(result.error).toBeUndefined();
  expect(result.count).toBe(14);
  expect(result.maxWater).toBe(0);
  expect(result.stageSamples).toBeGreaterThan(5);
  expect(result.firstStagingFourFiles).toBe(true);
  expect(result.goodStages / result.stageSamples).toBeGreaterThanOrEqual(.70);
  expect(result.stagedAt).not.toBeNull();
  expect(result.firstBridge).not.toBeNull();
  expect(result.arrivedAt).not.toBeNull();
  expect(result.alive).toBe(14);
  expect(errors).toEqual([]);
});
