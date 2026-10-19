const {test,expect}=require('@playwright/test');

test('v296 continuous meanders share authoritative navigation, village bank checks and minimap path',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=1',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.__RIVER_GEOMETRY_V296__?.samples?.length>120);
  const out=await page.evaluate(()=>{
    const g=__RIVER_GEOMETRY_V296__;
    const knots=g.knots.map(p=>({x:p.x,y:p.y,error:Math.abs(g.centerAt(p.y)-p.x)}));
    const ordered=g.samples.every((p,i)=>i===0||p.y>g.samples[i-1].y);
    const widths=g.samples.slice(0,-1).map((p,i)=>Math.hypot(
      g.samples[i+1].x-p.x,g.samples[i+1].y-p.y));
    const bridge=WATER_CROSSINGS_V067.map(c=>({
      id:c.id,water:waterAtV067(c.x,c.y),crossing:crossingAtV067(c.x,c.y)?.id,
      centerOffset:Math.abs(g.centerAt(c.y)-c.x),
      accessible:!pathBlockedV06({x:Math.floor(c.x/50),y:Math.floor(c.y/50)})
    }));
    const river=g.samples.filter(p=>
      WATER_CROSSINGS_V067.every(c=>Math.abs(c.y-p.y)>125)).slice(10,140);
    const foundCurvature=g.knots.some((a,i)=>{
      if(i===g.knots.length-1)return false;
      const b=g.knots[i+1],ym=(a.y+b.y)/2;
      const chord=(a.x+b.x)/2;
      return Math.abs(g.centerAt(ym)-chord)>1.3;
    });
    const dryChecks=river.filter(p=>waterAtV067(p.x,p.y)).length;
    const bank=river.slice(0,10).map(p=>{
      const bb=g.bankAt(p.x,p.y);
      const edge=g.bankAt(p.x+RIVER_NAV_HALF_WIDTH_V067+100,p.y);
      return{wet:bb.wet,edgeWet:edge.wet};
    });
    const before=VILLAGE_SCENERY_V4.flatMap(v=>v.houses);
    const wetHouses=before.filter(h=>!__VILLAGE_COLLISION_V4__.clearOfRiver(h,h.plotRadius));
    return {count:g.samples.length,ordered,maxStep:Math.max(...widths),knots,bridge,foundCurvature,
      dryChecks,riverCount:river.length,bank,wetHouses:wetHouses.map(h=>h.id)};
  });
  expect(errors).toEqual([]);
  expect(out.count).toBeGreaterThan(190);
  expect(out.ordered).toBe(true);
  expect(out.maxStep).toBeLessThan(35);
  expect(Math.max(...out.knots.map(p=>p.error))).toBeLessThan(0.001);
  expect(out.bridge).toHaveLength(5);
  for(const b of out.bridge){
    expect(b.water).toBe(false);
    expect(b.crossing).toBe(b.id);
    expect(b.centerOffset).toBeLessThan(5);
  }
  expect(out.foundCurvature).toBe(true);
  expect(out.dryChecks).toBeGreaterThan(15);
  expect(out.bank.every(b=>b.wet&&!b.edgeWet)).toBe(true);
  expect(out.wetHouses).toEqual([]);
});
