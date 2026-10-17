const {test,expect}=require('@playwright/test');

test('v257 reverse Pont Crête bridge approach with 18 infantry and square destination completes',async({page})=>{
  test.setTimeout(130000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    let seed=773311;Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__ROAD_COLUMN_V257__));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const reg of regiments)reg.destroyed=true;
    const c=WATER_CROSSINGS_V067.find(c=>c.id==='pont-crete'),side=1,lateral=42;
    const start=crossingPointV068(c,side*(c.length/2+210),lateral);
    const target=crossingPointV068(c,-side*(c.length/2+210),-lateral*.35);
    const foot=[];
    for(let i=0;i<18;i++)foot.push(createUnit('france','infantry',
      start.x+(i%9)*16,start.y+Math.floor(i/9)*18));
    const officer=createUnit('france','officer',start.x+55,start.y-30);
    const drummer=createUnit('france','drummer',start.x+80,start.y-30);
    const members=[...foot,officer,drummer];
    const reg=createRegiment('france',members);
    orderGroupPathV06(reg,target.x,target.y,'square',c.angle+Math.PI);
    let best=Infinity,complete=false;
    const timeline=[];
    for(let i=0;i<1800;i++){
      window.RTS_SIM.step(.05);
      if(i%100)continue;
      const m=reg.marchV063,center=centroid(members);
      const rem=Math.hypot(center.x-target.x,center.y-target.y);
      best=Math.min(best,rem);
      const local=crossingLocalV068(c,center.x,center.y);
      timeline.push({time:+elapsed.toFixed(1),remaining:+rem.toFixed(1),
        center:[+center.x.toFixed(1),+center.y.toFixed(1)],
        anchor:m?[+m.anchorX.toFixed(1),+m.anchorY.toFixed(1)]:null,
        pathIndex:reg.pathIndex,pathCount:reg.path?.length||0,
        phase:window.__ROAD_COLUMN_V257__.state(reg)?.phase,
        mphase:m?.phase,mode:m?.locomotionV064,
        crossing:reg.crossingTrafficV068?.state||null,
        holder:reg.crossingTrafficV068?.forcedColumn||false,
        along:+local.along.toFixed(1),
        tail:members.slice(-4).map(u=>({id:u.id,p:+crossingLocalV068(c,u.x,u.y).along.toFixed(1),
          perp:+crossingLocalV068(c,u.x,u.y).perp.toFixed(1),
          target:[+u.targetX.toFixed(1),+u.targetY.toFixed(1)]})),
        stats:window.__ROAD_COLUMN_V257__.metrics().blockedWaterSteps});
      complete=members.every(u=>crossingLocalV068(c,u.x,u.y).along*-1>c.length/2+24);
      if(complete)break;
    }
    const center=centroid(members);
    return{best,remaining:Math.hypot(center.x-target.x,center.y-target.y),
      complete,timeline,stats:window.__ROAD_COLUMN_V257__.metrics(),water:members.filter(u=>waterAtV067(u.x,u.y)).length,
      bridge:{angle:c.angle,length:c.length,width:c.width},start,target};
  });
  console.log('YUKA_PONT_CRETE_REVERSE_257',JSON.stringify(result));
  expect(result.water).toBe(0);
  expect(result.complete||result.remaining<100,JSON.stringify(result.timeline.slice(-6))).toBe(true);
  expect(errors).toEqual([]);
});
