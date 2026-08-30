const { test, expect } = require('@playwright/test');

async function openGame(page) {
  await page.addInitScript(() => {
    let seed = 773311;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=movement-coverage', { waitUntil:'networkidle' });
  await page.waitForFunction(() => Boolean(window.RTS_SIM && window.NRTS_NAVIGATION_V2?.active));
}

test('long opposite-bank routes are complete and every waypoint segment is water-safe', async ({ page }) => {
  test.setTimeout(60_000);
  await openGame(page);

  const diagnostics = await page.evaluate(() => {
    const cases = [
      {name:'moulin-verger',start:{x:330,y:1320},goal:{x:2520,y:1540},formation:'line'},
      {name:'ferme-lisiere',start:{x:1000,y:620},goal:{x:2760,y:1010},formation:'column'}
    ];
    const out=[];
    for(const item of cases){
      resetGame(); v05PeaceMode=true; gameOver=false;
      for(const u of units)u.dead=true;
      for(const r of regiments)r.destroyed=true;
      const made=[];
      for(let i=0;i<18;i++)made.push(createUnit('france','infantry',item.start.x+(i%9)*14,item.start.y+Math.floor(i/9)*16));
      made.push(createUnit('france','officer',item.start.x+40,item.start.y-25));
      made.push(createUnit('france','drummer',item.start.x+62,item.start.y-25));
      const reg=createRegiment('france',made);
      orderGroupPathV06(reg,item.goal.x,item.goal.y,item.formation,0);
      const path=(reg.path||[]).map(p=>({x:p.x,y:p.y}));
      const blocked=[];
      let previous={...item.start};
      path.forEach((p,index)=>{
        if(segmentCrossesBlockedWaterV067(previous.x,previous.y,p.x,p.y))blocked.push({index,from:previous,to:p});
        previous=p;
      });
      const last=path[path.length-1]||null;
      out.push({
        name:item.name,
        startSide:bankSideV067(item.start.x,item.start.y),
        goalSide:bankSideV067(item.goal.x,item.goal.y),
        pathLength:path.length,
        last,
        remaining:last?Math.hypot(last.x-item.goal.x,last.y-item.goal.y):null,
        blocked,
        path,
        routeCrossings:reg.routeCrossingsV067||[],
        navigation:reg.navigationV2||null,
        resolver:window.NRTS_BRIDGE_ROUTE_RESOLVER_V2?.stats?.()||null
      });
    }
    return out;
  });

  console.log('LONG_ROUTE_WATER_DIAGNOSTICS', JSON.stringify(diagnostics));
  for(const diagnostic of diagnostics){
    expect(diagnostic.startSide * diagnostic.goalSide).toBeLessThan(0);
    expect(diagnostic.pathLength).toBeGreaterThan(0);
    expect(diagnostic.remaining).toBeLessThan(120);
    expect(diagnostic.routeCrossings.length).toBeGreaterThan(0);
    expect(diagnostic.blocked).toEqual([]);
  }
});
