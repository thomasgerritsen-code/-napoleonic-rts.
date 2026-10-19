const {test,expect}=require('@playwright/test');

test('v296 river has continuous smooth curve through every unchanged road bridge',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RIVER_GEOMETRY_V296__));
  const result=await page.evaluate(()=>{
    const g=__RIVER_GEOMETRY_V296__;
    const a=RIVER_POINTS_V067;
    const anchors=a.map(k=>({y:k.y,dx:Math.abs(g.centerAtY(k.y).x-k.x)}));
    const bridges=WATER_CROSSINGS_V067.map(c=>({
      id:c.id,drift:Math.abs(g.centerAtY(c.y).x-c.x),
      navigable:!waterAtV067(c.x,c.y),crossing:crossingAtV067(c.x,c.y)?.id,
      dryLeft:!waterAtV067(c.x-195,c.y),dryRight:!waterAtV067(c.x+195,c.y)
    }));
    let jumps=0,stepMax=0,maxTurn=0;
    for(let i=1;i<g.samples.length;i++){
      const p=g.samples[i-1],q=g.samples[i];
      if(q.y<=p.y)jumps++;
      stepMax=Math.max(stepMax,Math.hypot(q.x-p.x,q.y-p.y));
    }
    for(let i=1;i<g.samples.length-1;i++){
      const a=g.samples[i-1],b=g.samples[i],c=g.samples[i+1];
      const ab=Math.atan2(b.y-a.y,b.x-a.x),bc=Math.atan2(c.y-b.y,c.x-b.x);
      maxTurn=Math.max(maxTurn,Math.abs(Math.atan2(Math.sin(bc-ab),Math.cos(bc-ab))));
    }
    const wet=RIVER_POINTS_V067.slice(1,4).map(p=>({x:p.x,y:p.y,wet:waterAtV067(p.x,p.y)}));
    const sampleHit=g.hit(g.centerAtY(2100).x+15,2100);
    return{version:g.version,count:g.samples.length,anchors,bridges,wet,jumps,stepMax,maxTurn,
      hitDistance:sampleHit.distance,navWidth:RIVER_NAV_HALF_WIDTH_V067,
      oldPointCount:a.length};
  });
  expect(errors).toEqual([]);
  expect(result.count).toBeGreaterThan(190);
  expect(result.anchors.every(a=>a.dx<.05)).toBe(true);
  expect(result.bridges).toHaveLength(5);
  for(const c of result.bridges){
    expect(c.drift).toBeLessThan(.05);
    expect(c.navigable).toBe(true);
    expect(c.crossing).toBe(c.id);
    expect(c.dryLeft&&c.dryRight).toBe(true);
  }
  expect(result.jumps).toBe(0);
  expect(result.stepMax).toBeLessThan(28);
  expect(result.maxTurn).toBeLessThan(.45);
  expect(result.wet.every(p=>p.wet)).toBe(true);
  expect(result.hitDistance).toBeGreaterThan(12);
  expect(result.hitDistance).toBeLessThan(18);
  expect(result.oldPointCount).toBe(18);
});

test('v296 old bridge system retains legal crossings and blocks adjacent river',async({page})=>{
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  const got=await page.evaluate(()=>{
    const crossings=WATER_CROSSINGS_V067.map(c=>{
      const west={x:c.x-210,y:c.y},east={x:c.x+210,y:c.y};
      const cross=segmentWaterCrossingV067(west.x,west.y,east.x,east.y);
      const off=segmentWaterCrossingV067(west.x,west.y+220,east.x,east.y+220);
      return{id:c.id,passes:cross?.crossing?.id===c.id&&!cross?.blocked,
        blockedAway:!!off?.blocked,water:waterAtV067(c.x,c.y)};
    });
    return crossings;
  });
  expect(got).toHaveLength(5);
  for(const c of got){expect(c.passes).toBe(true);expect(c.water).toBe(false);}
  expect(got.filter(c=>c.blockedAway).length).toBeGreaterThanOrEqual(3);
});
