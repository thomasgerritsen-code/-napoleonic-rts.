const {test,expect}=require('@playwright/test');

test('v260 real player move: completed bridge crossing never loops back without a new order',async({page})=>{
  test.setTimeout(150000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let seed=770261;Math.random=()=>{seed=seed*16807%2147483647;return(seed-1)/2147483646};});
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.NRTS_3D_SOURCE?.dispatch&&window.__ROAD_COLUMN_V257__?.singleAuthority));
  const data=await page.evaluate(()=>{
    const runs=[];
    for(const [crossId,side,count,extra] of [
      ['pont-chaussee',-1,12,180],['pont-chaussee',1,12,180],
      ['pont-crete',-1,18,180],['pont-crete',1,18,180],
      ['pont-fermes',-1,12,210],['pont-fermes',1,12,210]
    ]){
      resetGame();v05PeaceMode=true;gameOver=false;
      for(const u of units)u.dead=true;
      for(const reg of regiments)reg.destroyed=true;
      selectedUnits.clear();
      const c=WATER_CROSSINGS_V067.find(c=>c.id===crossId);
      if(!c){runs.push({crossId,error:'crossing missing'});continue;}
      const dir=-side,from=c.length/2+230,to=c.length/2+extra;
      const feet=[];
      for(let i=0;i<count;i++){
        const row=Math.floor(i/4),file=i%4;
        const p=crossingPointV068(c,side*(from+row*20),(file-1.5)*15);
        feet.push(createUnit('france','infantry',p.x,p.y));
      }
      const off=crossingPointV068(c,side*(from+Math.ceil(count/4)*20),-13);
      const drum=crossingPointV068(c,side*(from+Math.ceil(count/4)*20),13);
      const officer=createUnit('france','officer',off.x,off.y);
      const drummer=createUnit('france','drummer',drum.x,drum.y);
      const members=[...feet,officer,drummer],reg=createRegiment('france',members);
      const destination=crossingPointV068(c,dir*to,0);
      const selected=window.NRTS_3D_SOURCE.dispatch({type:'select-group',id:reg.id});
      const commanded=window.NRTS_3D_SOURCE.dispatch({type:'move',x:destination.x,y:destination.y});
      let maxAnchor=-Infinity,retreatFromMax=0,onceBeyond=false,returnedToDeck=false,
        clearedAll=false,returnedAfterClear=false,firstBeyond=null,firstClear=null,
        water=0;
      const samples=[];
      for(let t=0;t<2300;t++){
        window.RTS_SIM.step(.05);
        if(t%10)continue;
        const m=reg.marchV063,st=window.__ROAD_COLUMN_V257__.state(reg);
        const anchor=m?crossingLocalV068(c,m.anchorX,m.anchorY).along*dir:null;
        const progress=members.map(u=>crossingLocalV068(c,u.x,u.y).along*dir);
        const min=Math.min(...progress),max=Math.max(...progress);
        if(anchor!=null){
          if(anchor>c.length/2+42&&!onceBeyond){onceBeyond=true;firstBeyond=t;}
          if(onceBeyond&&anchor<c.length/2-20)returnedToDeck=true;
          maxAnchor=Math.max(maxAnchor,anchor);
          retreatFromMax=Math.max(retreatFromMax,maxAnchor-anchor);
        }
        if(min>c.length/2+25&&!clearedAll){clearedAll=true;firstClear=t;}
        if(clearedAll&&min<c.length/2-5)returnedAfterClear=true;
        water+=members.filter(u=>waterAtV067(u.x,u.y)).length;
        if(t%200===0||firstBeyond===t||firstClear===t)
          samples.push({sec:Math.round(t*.05),anchor:anchor===null?null:+anchor.toFixed(0),
            min:+min.toFixed(0),max:+max.toFixed(0),phase:st?.phase||null,
            traffic:reg.crossingTrafficV068?.state||null,initialSide:reg.crossingTrafficV068?.initialSide||null,
            pathIndex:reg.pathIndex,pathCount:reg.path?.length||0,finalTarget:reg.finalTarget,
            mphase:m?.phase||null,
            waypoint:reg.path?.[reg.pathIndex]?
              {...crossingLocalV068(c,reg.path[reg.pathIndex].x,reg.path[reg.pathIndex].y),
                progress:+(crossingLocalV068(c,reg.path[reg.pathIndex].x,reg.path[reg.pathIndex].y).along*dir).toFixed(0)}:null,
            worst:(()=>{
              const u=members.reduce((w,u)=>crossingLocalV068(c,u.x,u.y).along*dir<
                crossingLocalV068(c,w.x,w.y).along*dir?u:w,members[0]);
              const l=crossingLocalV068(c,u.x,u.y);
              const to=crossingLocalV068(c,u.targetX,u.targetY);
              return {id:u.id,type:u.type,along:+(l.along*dir).toFixed(0),
                lateral:+l.perp.toFixed(0),targetProgress:+(to.along*dir).toFixed(0),
                targetLateral:+to.perp.toFixed(0),
                blocked:segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY),
                dead:u.dead,routing:u.routing,water:waterAtV067(u.x,u.y),
                nextWater:waterAtV067(u.x+Math.cos(c.angle)*dir*5,u.y+Math.sin(c.angle)*dir*5),
                nextBlocked:segmentCrossesBlockedWaterV067(u.x,u.y,u.x+Math.cos(c.angle)*dir*5,u.y+Math.sin(c.angle)*dir*5)};

            })()});
      }
      const progress=members.map(u=>crossingLocalV068(c,u.x,u.y).along*dir);
      runs.push({crossId,side,count,extra,selected,commanded,onceBeyond,clearedAll,returnedToDeck,
        returnedAfterClear,firstBeyond,firstClear,retreatFromMax:+retreatFromMax.toFixed(1),
        minFinal:+Math.min(...progress).toFixed(1),water,samples,
        marchActive:!!reg.marchV063?.v064,
        stats:window.__ROAD_COLUMN_V257__.metrics()});
    }
    return runs;
  });
  console.log('BRIDGE_NO_REVERSE_PLAYER_V260',JSON.stringify(data));
  expect(errors).toEqual([]);
  for(const d of data){
    expect(d.error).toBeUndefined();
    expect(d.selected).toBe(true);expect(d.commanded).toBe(true);
    expect(d.onceBeyond,JSON.stringify(d)).toBe(true);
    expect(d.clearedAll,JSON.stringify(d)).toBe(true);
    expect(d.returnedToDeck,JSON.stringify(d)).toBe(false);
    expect(d.returnedAfterClear,JSON.stringify(d)).toBe(false);
    expect(d.water,JSON.stringify(d)).toBe(0);
  }
});
