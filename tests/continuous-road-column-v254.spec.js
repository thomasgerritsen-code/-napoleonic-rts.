const {test,expect}=require('@playwright/test');

test('live RTS retains one column controller across long routes and route replans',async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on('pageerror',err=>errors.push(err.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.RTS_SIM&&
    window.__ROAD_COLUMN_V257__?.version==='257.0'));
  const result=await page.evaluate(()=>{
    resetGame();v05PeaceMode=true;gameOver=false;
    for(const u of units)u.dead=true;
    for(const r of regiments)r.destroyed=true;
    const road=ROAD_NETWORK_V066.find(r=>r.id==='grande-chaussee');
    const start=road?.points[1];
    if(!start)return{error:'road not found'};
    const soldiers=[];
    for(let i=0;i<20;i++)
      soldiers.push(createUnit('france','infantry',
        start.x+(i%4)*15,start.y+Math.floor(i/4)*19));
    soldiers.push(createUnit('france','officer',start.x-25,start.y-16));
    soldiers.push(createUnit('france','drummer',start.x-25,start.y+16));
    const reg=createRegiment('france',soldiers);
    if(!reg)return{error:'regiment not created'};
    orderGroupPathV06(reg,start.x+400,start.y,'column',null);
    const march=reg.marchV063;
    if(!march)return{error:'no march'};
    // A simulated long-range navigation replan on the SAME move order;
    // an earlier build silently opted out above 1800 world units.
    reg.path=[{x:start.x+1100,y:start.y},{x:start.x+2400,y:start.y}];
    reg.pathIndex=0;
    for(let i=0;i<12;i++)window.RTS_SIM.step(.05);
    const first=window.__MARCH_LAB_LIVE_V253__.state(reg);
    const sameMarch=reg.marchV063===march;
    reg.path=[{x:start.x+1200,y:start.y},{x:start.x+2550,y:start.y}];
    reg.pathIndex=0;
    window.RTS_SIM.step(.05);
    const second=window.__MARCH_LAB_LIVE_V253__.state(reg);
    const metrics=window.__MARCH_LAB_LIVE_V253__.metrics();
    return{first,second,metrics,sameMarch,
      water:soldiers.filter(u=>waterAtV067(u.x,u.y)).length};
  });
  console.log('CONTINUOUS_COLUMN_254',JSON.stringify(result));
  expect(result.error).toBeUndefined();
  expect(result.first?.length).toBeGreaterThan(1800);
  expect(result.first?.files).toBe(4);
  expect(result.second?.files).toBe(4);
  expect(result.sameMarch).toBe(true);
  expect(result.metrics.longRouteOrders).toBeGreaterThan(0);
  expect(result.metrics.longRouteFallbacks).toBe(0);
  expect(result.metrics.preservedReplans).toBeGreaterThan(0);
  expect(result.water).toBe(0);
  expect(errors).toEqual([]);
});
