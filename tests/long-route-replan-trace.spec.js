const { test, expect } = require('@playwright/test');

test('long river routes retain diagnosable replan history', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    let seed=773311;
    Math.random=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
  });
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&window.__STUCK_RECOVERY_V2__?.replanTracing));

  const result=await page.evaluate(()=>{
    const roadPoint=(id,index)=>{const road=ROAD_NETWORK_V066.find(r=>r.id===id),p=road.points[index<0?road.points.length+index:index];return{x:p.x,y:p.y,road:id};};
    const pairs=[
      {start:roadPoint('voie-du-moulin',1),target:roadPoint('voie-du-verger',-2)},
      {start:roadPoint('voie-de-la-ferme',-2),target:roadPoint('voie-de-la-lisiere',-2)}
    ];
    const out=[];
    for(const pair of pairs){
      resetGame();v05PeaceMode=true;gameOver=false;for(const u of units)u.dead=true;for(const r of regiments)r.destroyed=true;
      const made=[];for(let i=0;i<18;i++)made.push(createUnit('france','infantry',pair.start.x+(i%9)*14,pair.start.y+Math.floor(i/9)*16));
      made.push(createUnit('france','officer',pair.start.x+40,pair.start.y-25));made.push(createUnit('france','drummer',pair.start.x+62,pair.start.y-25));
      const reg=createRegiment('france',made);orderGroupPathV06(reg,pair.target.x,pair.target.y,'column',0);
      const initial={crossings:(reg.routeCrossingsV067||[]).map(x=>x.id),pathLength:reg.path?.length||0};
      for(let step=0;step<4800;step++)window.RTS_SIM.step(.05);
      const members=regimentMembers(reg).filter(u=>!u.dead),center=members.length?centroid(members):{x:NaN,y:NaN};
      const stats=window.__STUCK_RECOVERY_V2__.stats();
      out.push({from:pair.start.road,to:pair.target.road,initial,final:{crossings:(reg.routeCrossingsV067||[]).map(x=>x.id),pathLength:reg.path?.length||0,pathIndex:reg.pathIndex||0,crossingState:reg.crossingTrafficV068?.crossingId||null,remaining:Number.isFinite(center.x)?+Math.hypot(center.x-pair.target.x,center.y-pair.target.y).toFixed(1):null},replans:(stats.lastGroupReplans||[]).filter(x=>x.regId===reg.id)});
    }
    return out;
  });
  console.log('LONG_ROUTE_REPLAN_TRACE',JSON.stringify(result));
  expect(result).toHaveLength(2);
  for(const route of result)expect(route.initial.pathLength).toBeGreaterThan(0);
});
