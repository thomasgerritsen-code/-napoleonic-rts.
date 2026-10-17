const {test,expect}=require('@playwright/test');

test('real RTS uses shared Marchlab ColumnModel for physical four-file bridge march',async({page})=>{
  test.setTimeout(160000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__MARCH_LAB_LIVE_V253__?.usingMarchLabCore));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const bridge=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
    const start=crossingPointV068(bridge,-bridge.length/2-250,25);
    const made=[];
    for(let i=0;i<12;i++)made.push(createUnit('france','infantry',
      start.x+(i%6)*20,start.y+(Math.floor(i/6)-.5)*18));
    made.push(createUnit('france','officer',start.x-25,start.y-14));
    made.push(createUnit('france','drummer',start.x-25,start.y+14));
    const reg=createRegiment('france',made);
    selectWholeRegiment(reg);
    const end=crossingPointV068(bridge,bridge.length/2+390,0);
    issueMoveWithFacingV06(end.x,end.y,0);
    const infoAtStart=window.__MARCH_LAB_LIVE_V253__.state(reg);
    let deckFrames=0,alignedFrames=0,maxWater=0,allAcross=false,marchLabFrames=0,
      normalRoadFrames=0,complete=false,physicallyDifferent=false;
    const snapshots=[];
    const lanes=[-22.5,-7.5,7.5,22.5];
    for(let i=0;i<4400;i++){
      window.RTS_SIM.step(.05);
      if(i%6)continue;
      const st=window.__MARCH_LAB_LIVE_V253__.state(reg);
      if(st){marchLabFrames++;if(st.phase==='marching')normalRoadFrames++;}
      const foot=made.filter(u=>u.type==='infantry');
      maxWater=Math.max(maxWater,made.filter(u=>waterAtV067(u.x,u.y)).length);
      const onDeck=foot.filter(u=>crossingPassageContainsV067(bridge,u.x,u.y));
      if(onDeck.length>=8){
        deckFrames++;
        const aligned=onDeck.filter(u=>{
          const perp=crossingLocalV068(bridge,u.x,u.y).perp;
          return lanes.some(x=>Math.abs(x-perp)<9);
        }).length;
        const occupied=new Set(onDeck.map(u=>{
          const perp=crossingLocalV068(bridge,u.x,u.y).perp;
          return lanes.reduce((best,x,k)=>Math.abs(x-perp)<Math.abs(lanes[best]-perp)?k:best,0);
        }));
        if(aligned>=8&&occupied.size===4)alignedFrames++;
      }
      const allFar=made.every(u=>{
        const local=crossingLocalV068(bridge,u.x,u.y);
        return local.along>bridge.length/2+26&&!waterAtV067(u.x,u.y);
      });
      allAcross||=allFar;
      if(i%280===0&&snapshots.length<15)snapshots.push({
        t:+elapsed.toFixed(1),phase:st?.phase,road:reg.marchV063?.locomotionV064,
        bridge:reg.crossingTrafficV068?.state,
        pos:foot.slice(0,6).map(u=>({x:+u.x.toFixed(1),y:+u.y.toFixed(1)})),
        anchor:reg.marchV063?{x:+reg.marchV063.anchorX.toFixed(1),y:+reg.marchV063.anchorY.toFixed(1)}:null
      });
      if(allAcross&&!reg.marchV063){complete=true;break;}
    }
    const metrics=window.__MARCH_LAB_LIVE_V253__.metrics();
    return{infoAtStart,marchLabFrames,normalRoadFrames,deckFrames,alignedFrames,
      fraction:deckFrames?alignedFrames/deckFrames:0,allAcross,complete,
      alive:made.filter(u=>!u.dead).length,maxWater,metrics,snapshots};
  });
  console.log('MARCH_LAB_LIVE_BRIDGE_253',JSON.stringify(result));
  expect(result.infoAtStart).not.toBeNull();
  expect(result.marchLabFrames).toBeGreaterThan(20);
  expect(result.deckFrames).toBeGreaterThan(14);
  expect(result.fraction,JSON.stringify(result.snapshots)).toBeGreaterThan(.7);
  expect(result.maxWater).toBe(0);
  expect(result.allAcross).toBe(true);
  expect(result.complete).toBe(true);
  expect(result.alive).toBe(14);
  expect(result.metrics.physicalMoves).toBeGreaterThan(100);
  expect(errors).toEqual([]);
});

test('player march on a winding road really uses Marchlab shared curved rows',async({page})=>{
  test.setTimeout(140000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__MARCH_LAB_LIVE_V253__));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const road=ROAD_NETWORK_V066.find(item=>item.id==='route-du-nord');
    if(!road)return{error:'missing winding road'};
    const start=road.points[1],dest=road.points[road.points.length-3];
    const soldiers=[];
    for(let i=0;i<24;i++)soldiers.push(createUnit('france','infantry',
      start.x+(i%4)*14,start.y+(Math.floor(i/4))*12));
    soldiers.push(createUnit('france','officer',start.x-25,start.y));
    soldiers.push(createUnit('france','drummer',start.x-25,start.y+18));
    const reg=createRegiment('france',soldiers);
    selectWholeRegiment(reg);issueMoveWithFacingV06(dest.x,dest.y,null);
    let roadFrames=0,physicalOnRoad=0,allSamples=0,phaseCount=0,maxWater=0;
    const rows=[];
    for(let i=0;i<3000;i++){
      window.RTS_SIM.step(.05);
      if(i%8)continue;
      const st=window.__MARCH_LAB_LIVE_V253__.state(reg);
      if(!st||st.phase==='field')continue;
      phaseCount++;
      const march=reg.marchV063;
      if(march&&roadAtV064(march.anchorX,march.anchorY)&&
         !reg.crossingTrafficV068?.forcedColumn){
        roadFrames++;
        for(const u of soldiers.filter(u=>u.type==='infantry')){
          allSamples++;if(roadNetworkAtV066(u.x,u.y))physicalOnRoad++;
        }
        if(i%400===0)rows.push({time:+elapsed.toFixed(1),phase:st.phase,
          regX:reg.marchV063.anchorX,progress:st.progress});
      }
    }
    return{roadFrames,phaseCount,onRoad:allSamples?physicalOnRoad/allSamples:0,
      maxWater,soldiers:soldiers.filter(u=>!u.dead).length,
      metrics:window.__MARCH_LAB_LIVE_V253__.metrics(),rows};
  });
  console.log('MARCH_LAB_LIVE_ROADS_253',JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.phaseCount).toBeGreaterThan(30);
  expect(result.roadFrames).toBeGreaterThan(35);
  expect(result.onRoad).toBeGreaterThan(.80);
  expect(result.metrics.physicalMoves).toBeGreaterThan(50);
  expect(errors).toEqual([]);
});
