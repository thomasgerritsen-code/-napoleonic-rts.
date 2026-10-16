const {test,expect}=require('@playwright/test');

test('Cossacks column v2: actual players physically march in four bridge lanes, never a scattered blob',async({page})=>{
  test.setTimeout(145000);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__REGIMENT_MARCH_V251__?.oneSlotAuthority));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const crossing=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const start=crossingPointV068(crossing,-crossing.length/2-230,40);
    const members=[];
    for(let i=0;i<12;i++)
      members.push(createUnit('france','infantry',start.x+(i%6)*22,start.y+(Math.floor(i/6)-.5)*22));
    members.push(createUnit('france','officer',start.x-22,start.y-9));
    members.push(createUnit('france','drummer',start.x-22,start.y+9));
    const reg=createRegiment('france',members);
    if(!reg)return{error:'regiment was not created'};
    selectWholeRegiment(reg);
    const end=crossingPointV068(crossing,crossing.length/2+500,0);
    issueMoveWithFacingV06(end.x,end.y,0);
    let deckFrames=0,alignedFrames=0,alignedSoldierTotal=0,deckSoldierTotal=0;
    let maxWater=0,allCrossedAt=null,allFormedAt=null,maxPhysicalSpread=0;
    let roadFrames=0,modeFlips=0,prevMode='',photos=[];
    const lanes=[-22.5,-7.5,7.5,22.5];
    for(let i=0;i<4800;i++){
      window.RTS_SIM.step(.05);
      if(i%6)continue;
      const infantry=members.filter(u=>u.type==='infantry');
      const current=members.filter(u=>!u.dead);
      const onDeck=infantry.filter(u=>crossingPassageContainsV067(crossing,u.x,u.y));
      maxWater=Math.max(maxWater,current.filter(u=>waterAtV067(u.x,u.y)).length);
      const state=window.__REGIMENT_MARCH_V251__.state(reg);
      const mode=state?.bridgeId?'bridge':state?.phase||'idle';
      if(prevMode&&mode!==prevMode)modeFlips++;prevMode=mode;
      if(state?.phase==='marching')roadFrames++;
      if(onDeck.length>=8){
        deckFrames++;
        const aligned=onDeck.filter(u=>{
          const p=crossingLocalV068(crossing,u.x,u.y).perp;
          return lanes.some(lane=>Math.abs(p-lane)<10);
        }).length;
        const files=new Set(onDeck.map(u=>{
          const p=crossingLocalV068(crossing,u.x,u.y).perp;
          return lanes.reduce((best,lane,k)=>
            Math.abs(p-lane)<Math.abs(p-lanes[best])?k:best,0);
        }));
        if(aligned>=8&&files.size===4)alignedFrames++;
        deckSoldierTotal+=onDeck.length;alignedSoldierTotal+=aligned;
      }
      const center=centroid(infantry);
      maxPhysicalSpread=Math.max(maxPhysicalSpread,...infantry.map(u=>Math.hypot(u.x-center.x,u.y-center.y)));
      if(i%280===0&&photos.length<12)photos.push({t:+elapsed.toFixed(1),
        mode,infantryOnDeck:onDeck.length,bridgeState:reg.crossingTrafficV068?.state||null,
        pos:infantry.map(u=>({x:+u.x.toFixed(1),y:+u.y.toFixed(1)})),
        anchor:reg.marchV063?{x:+reg.marchV063.anchorX.toFixed(1),y:+reg.marchV063.anchorY.toFixed(1)}:null});
      if(!allCrossedAt && current.length===14 && current.every(u=>{
        const p=crossingLocalV068(crossing,u.x,u.y);
        return p.along>crossing.length/2+32 && !waterAtV067(u.x,u.y);
      }))allCrossedAt=elapsed;
      if(allCrossedAt&&!reg.marchV063){allFormedAt=elapsed;break;}
    }
    return{alive:members.filter(u=>!u.dead).length,deckFrames,alignedFrames,
      alignedFraction:deckFrames?alignedFrames/deckFrames:0,
      soldierAlignment:deckSoldierTotal?alignedSoldierTotal/deckSoldierTotal:0,
      maxWater,allCrossedAt,allFormedAt,modeFlips,roadFrames,
      maxPhysicalSpread,stats:window.__REGIMENT_MARCH_V251__.stats(),
      photos:photos.map(p=>({...p,pos:p.pos.slice(0,5)}))};
  });
  console.log('UNIFIED_PHYSICAL_COLUMN_251',JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.alive).toBe(14);
  expect(result.maxWater).toBe(0);
  expect(result.deckFrames).toBeGreaterThan(15);
  expect(result.alignedFraction).toBeGreaterThan(.75);
  expect(result.soldierAlignment).toBeGreaterThan(.80);
  expect(result.stats.bridgeFrames).toBeGreaterThan(40);
  expect(result.allCrossedAt,JSON.stringify(result.photos)).not.toBeNull();
  expect(result.allFormedAt,JSON.stringify(result.photos)).not.toBeNull();
  expect(errors).toEqual([]);
});
