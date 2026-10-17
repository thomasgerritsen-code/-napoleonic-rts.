const {test,expect}=require('@playwright/test');

test('v257 actual regiments of 12 and 36 stay four files on roads, not just four targets',async({page})=>{
  test.setTimeout(160000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__ROAD_COLUMN_V257__?.singleAuthority));
  const results=await page.evaluate(()=>{
    const cases=[];
    for(const count of [12,36]){
      resetGame();v05PeaceMode=true;gameOver=false;
      for(const u of units)u.dead=true;
      for(const reg of regiments)reg.destroyed=true;
      const road=ROAD_NETWORK_V066.find(r=>r.id==='grande-chaussee');
      const start=road.points[1],finish=road.points[road.points.length-3];
      const feet=[];
      for(let i=0;i<count;i++)feet.push(createUnit('france','infantry',
        start.x+(i%6)*15,start.y+(Math.floor(i/6)-3)*17));
      const officer=createUnit('france','officer',start.x-35,start.y-12);
      const drummer=createUnit('france','drummer',start.x-35,start.y+12);
      const reg=createRegiment('france',[...feet,officer,drummer]);
      selectWholeRegiment(reg);
      issueMoveWithFacingV06(finish.x,finish.y,null);
      let samples=0,aligned=0,water=0,frames=0,skipped=0;
      const examples=[];
      for(let tick=0;tick<1400;tick++){
        window.RTS_SIM.step(.05);
        if(tick%10)continue;
        const m=reg.marchV063,s=window.__ROAD_COLUMN_V257__.state(reg);
        water+=feet.filter(u=>waterAtV067(u.x,u.y)).length;
        if(!m||s?.phase!=='marching'||!roadAtV064(m.anchorX,m.anchorY)||
           tick<90||reg.crossingTrafficV068?.forcedColumn)continue;
        const heading=m.marchFacing;
        const c=Math.cos(heading),sin=Math.sin(heading);
        let correct=0,total=0;
        for(let i=0;i<feet.length;i+=4){
          const row=feet.slice(i,i+4);
          if(row.length!==4)continue;
          const forward=row.map(u=>u.x*c+u.y*sin);
          const lateral=row.map(u=>-u.x*sin+u.y*c);
          const width=Math.max(...lateral)-Math.min(...lateral);
          const depth=Math.max(...forward)-Math.min(...forward);
          if(width>37&&width<85&&depth<19)correct++;
          total++;
        }
        samples++;const fraction=total?correct/total:0;
        if(fraction>.70)aligned++;
        if(examples.length<5&&tick%150===0)examples.push({tick,phase:s?.phase,rowsCorrect:correct,rows:total,
          positions:feet.slice(0,8).map(u=>[+u.x.toFixed(1),+u.y.toFixed(1)])});
      }
      cases.push({count,samples,aligned,share:samples?aligned/samples:0,water,
        actual:window.__ROAD_COLUMN_V257__.metrics().physicalMoves,examples,
        owner:window.__ROAD_COLUMN_V257__.singleAuthority});
    }
    return cases;
  });
  console.log('YUKA_FOUR_FILE_REAL_ROAD_V257',JSON.stringify(results));
  expect(results.map(x=>x.count)).toEqual([12,36]);
  for(const x of results){
    expect(x.owner).toBe(true);
    expect(x.samples,JSON.stringify(x)).toBeGreaterThan(16);
    expect(x.share,JSON.stringify(x)).toBeGreaterThan(.70);
    expect(x.water).toBe(0);
    expect(x.actual).toBeGreaterThan(100);
  }
  expect(errors).toEqual([]);
});

test('v257 12 infantry cross the pont-chaussee in four NARROW physical files, no water entry',async({page})=>{
  test.setTimeout(155000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__ROAD_COLUMN_V257__?.singleAuthority);
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const bridge=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const start=crossingPointV068(bridge,-bridge.length/2-235,25);
    const foot=[];
    for(let i=0;i<12;i++)foot.push(createUnit('france','infantry',
      start.x+(i%6)*19,start.y+(Math.floor(i/6)-.5)*19));
    const officer=createUnit('france','officer',start.x-35,start.y-12);
    const drummer=createUnit('france','drummer',start.x-35,start.y+12);
    const regiment=createRegiment('france',[...foot,officer,drummer]);
    selectWholeRegiment(regiment);
    const dest=crossingPointV068(bridge,bridge.length/2+360,0);
    issueMoveWithFacingV06(dest.x,dest.y,null);
    let frames=0,alignedFrames=0,waterEntries=0,across=false;
    const lanes=[-22.5,-7.5,7.5,22.5];
    for(let i=0;i<4500;i++){
      window.RTS_SIM.step(.05);
      if(i%7)continue;
      waterEntries+=foot.filter(u=>waterAtV067(u.x,u.y)).length;
      const onDeck=foot.filter(u=>crossingPassageContainsV067(bridge,u.x,u.y));
      if(onDeck.length>=8){
        frames++;
        const correct=onDeck.filter(u=>{
          const p=crossingLocalV068(bridge,u.x,u.y).perp;
          return lanes.some(v=>Math.abs(p-v)<10);
        }).length;
        const unique=new Set(onDeck.map(u=>{
          const p=crossingLocalV068(bridge,u.x,u.y).perp;
          return lanes.reduce((best,v,k)=>Math.abs(p-v)<Math.abs(p-lanes[best])?k:best,0);
        }));
        if(correct>=8&&unique.size===4)alignedFrames++;
      }
      across||=foot.every(u=>crossingLocalV068(bridge,u.x,u.y).along>bridge.length/2+26);
      if(across&&!regiment.marchV063)break;
    }
    return{frames,alignedFrames,share:frames?alignedFrames/frames:0,waterEntries,across,
      stats:window.__ROAD_COLUMN_V257__.metrics()};
  });
  console.log('YUKA_BRIDGE_12_V257',JSON.stringify(result));
  expect(result.frames,JSON.stringify(result)).toBeGreaterThan(12);
  expect(result.share,JSON.stringify(result)).toBeGreaterThan(.7);
  expect(result.waterEntries).toBe(0);
  expect(result.across).toBe(true);
  expect(errors).toEqual([]);
});
