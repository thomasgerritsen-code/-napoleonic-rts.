const {test,expect}=require('@playwright/test');

test('v261 real player 12/18-man columns narrow only during final bridge approach',async({page})=>{
  test.setTimeout(140000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let seed=261711;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.NRTS_3D_SOURCE?.dispatch&&window.__ROAD_COLUMN_V257__?.singleAuthority));
  const data=await page.evaluate(()=>{
    const output=[];
    for(const [id,side,count] of [
      ['pont-chaussee',-1,12],['pont-crete',1,18],['pont-fermes',-1,12]
    ]){
      resetGame();v05PeaceMode=true;gameOver=false;
      for(const u of units)u.dead=true;
      for(const reg of regiments)reg.destroyed=true;
      selectedUnits.clear();
      const c=WATER_CROSSINGS_V067.find(x=>x.id===id),dir=-side;
      const foot=[];
      for(let i=0;i<count;i++){
        const p=crossingPointV068(c,side*(c.length/2+250+Math.floor(i/4)*20),(i%4-1.5)*18);
        foot.push(createUnit('france','infantry',p.x,p.y));
      }
      const start=crossingPointV068(c,side*(c.length/2+250+Math.ceil(count/4)*20),0);
      const reg=createRegiment('france',[
        ...foot,
        createUnit('france','officer',start.x,start.y-12),
        createUnit('france','drummer',start.x,start.y+12)
      ]);
      window.NRTS_3D_SOURCE.dispatch({type:'select-group',id:reg.id});
      const dest=crossingPointV068(c,dir*(c.length/2+270),0);
      window.NRTS_3D_SOURCE.dispatch({type:'move',x:dest.x,y:dest.y});
      const early=[],approach=[],onDeck=[];
      let safelyCleared=false,returnToDeck=false,maxLeader=-Infinity;
      for(let tick=0;tick<1750;tick++){
        window.RTS_SIM.step(.05);
        if(tick%5)continue;
        const m=reg.marchV063;
        const local=m?crossingLocalV068(c,m.anchorX,m.anchorY):null;
        const clearance=local?local.along*side-c.length/2:null;
        const lane=u=>crossingLocalV068(c,u.x,u.y).perp;
        const span=(xs)=>Math.max(...xs)-Math.min(...xs);
        const physical=span(foot.slice(0,4).map(lane));
        const target=span(foot.slice(0,4).map(u=>crossingLocalV068(c,u.targetX,u.targetY).perp));
        if(clearance!==null){
          if(clearance>155&&clearance<225)early.push({clearance,physical,target});
          if(clearance>35&&clearance<65)approach.push({clearance,physical,target});
          if(clearance<0&&clearance>-55)onDeck.push({clearance,physical,target});
          maxLeader=Math.max(maxLeader,local.along*dir);
          if(maxLeader>c.length/2+42&&local.along*dir<c.length/2-20)returnToDeck=true;
        }
        const min=Math.min(...regimentMembers(reg).filter(u=>!u.dead).map(u=>crossingLocalV068(c,u.x,u.y).along*dir));
        if(min>c.length/2+25)safelyCleared=true;
        if(safelyCleared&&min<c.length/2-6)returnToDeck=true;
      }
      const mean=(a,k)=>a.length?a.reduce((sum,x)=>sum+x[k],0)/a.length:null;
      output.push({id,side,count,earlySamples:early.length,
        approachSamples:approach.length,onDeckSamples:onDeck.length,
        earlyPhysical:mean(early,'physical'),earlyTarget:mean(early,'target'),
        approachPhysical:mean(approach,'physical'),approachTarget:mean(approach,'target'),
        deckPhysical:mean(onDeck,'physical'),deckTarget:mean(onDeck,'target'),
        safelyCleared,returnToDeck,water:foot.filter(u=>waterAtV067(u.x,u.y)).length,
        selectedFirst:early.slice(0,2),selectedDeck:onDeck.slice(0,2)});
    }
    return output;
  });
  console.log('V261_LATE_BRIDGE_COMPRESSION',JSON.stringify(data));
  expect(errors).toEqual([]);
  for(const item of data){
    expect(item.earlySamples,JSON.stringify(item)).toBeGreaterThan(3);
    expect(item.onDeckSamples,JSON.stringify(item)).toBeGreaterThan(3);
    // 18-unit road lanes mean 54-unit width. They MUST NOT squeeze to the
    // 15-unit bridge lanes (45-unit width) hundreds of units upstream.
    expect(item.earlyPhysical,JSON.stringify(item)).toBeGreaterThan(49);
    expect(item.earlyTarget,JSON.stringify(item)).toBeGreaterThan(50);
    // By the entrance the four files have closed to about 45 units.
    expect(item.deckTarget,JSON.stringify(item)).toBeLessThan(49);
    expect(item.safelyCleared,JSON.stringify(item)).toBe(true);
    expect(item.returnToDeck,JSON.stringify(item)).toBe(false);
    expect(item.water,JSON.stringify(item)).toBe(0);
  }
});
