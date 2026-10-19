const {test,expect}=require('@playwright/test');

test('v296 one continuous spline is shared by collision, bank safety, bridges and minimap',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>window.RTS_SIM?.version&&typeof riverTangentV296==='function');
  const d=await page.evaluate(()=>{
    const samples=RIVER_CURVE_V296,anchors=RIVER_POINTS_V067;
    const bridges=WATER_CROSSINGS_V067.map(c=>({
      id:c.id,center:riverCenterXAtYV067(c.y),expected:c.x,
      water:waterAtV067(c.x,c.y),crossing:crossingAtV067(c.x,c.y)?.id,
      hit:riverHitV067(c.x,c.y)?.distance
    }));
    const anchorErrors=anchors.map(p=>Math.abs(riverCenterXAtYV067(p.y)-p.x));
    const t=samples.slice(5,-5).filter((_,i)=>i%15===0).map(p=>{
      const v=riverTangentV296(p.y),hit=riverHitV067(p.x,p.y);
      const bank={x:p.x+RIVER_NAV_HALF_WIDTH_V067+200,y:p.y};
      return{length:Math.hypot(v.x,v.y),dist:hit.distance,blocked:waterAtV067(bank.x,bank.y)};
    });
    let bend=0,turns=0;
    for(let i=1;i<samples.length-1;i++){
      const a=samples[i-1],b=samples[i],c=samples[i+1];
      if(i%8===0){
        const dy=c.y-a.y;
        const straight=a.x+(c.x-a.x)*(b.y-a.y)/dy;
        if(Math.abs(b.x-straight)>.005)turns++;
      }
      if(b.y<=a.y)bend++;
    }
    resetGame();
    const eco=__BATTLEFIELD_ECOLOGY_V1__;
    const vegetation=resources.filter(r=>!r.dead&&r.amount>0);
    const house=VILLAGE_SCENERY_V4.flatMap(v=>v.houses||[]);
    const wetResources=vegetation.filter(r=>eco.riverbankConflict(r.type,r.x,r.y));
    const wetHouses=house.filter(h=>!__VILLAGE_COLLISION_V4__.clearOfRiver(h,h.plotRadius));
    return{samples:samples.length,anchors:anchors.length,anchorMax:Math.max(...anchorErrors),
      bridges,t,nonMonotone:bend,turns,wetResources:wetResources.length,wetHouses:wetHouses.length,
      crossingIds:bridges.map(b=>b.id)};
  });
  expect(errors).toEqual([]);
  expect(d.samples).toBeGreaterThan(180);
  expect(d.anchorMax).toBeLessThan(.05);
  expect(d.nonMonotone).toBe(0);
  expect(d.turns).toBeGreaterThan(8);
  expect(d.t.every(x=>Math.abs(x.length-1)<.001&&x.dist<.5&&!x.blocked)).toBe(true);
  for(const b of d.bridges){
    expect(b.center).toBeCloseTo(b.expected,1);
    expect(b.water).toBe(false);
    expect(b.crossing).toBe(b.id);
    expect(b.hit).toBeLessThan(1);
  }
  expect(d.wetResources).toBe(0);
  expect(d.wetHouses).toBe(0);
});

test('v296 plotted river and water query agree away from all five bridge decks',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  const report=await page.evaluate(()=>{
    let wet=0,dry=0,invalid=0;
    for(let y=200;y<4600;y+=85){
      const x=riverCenterXAtYV067(y);
      const bridge=WATER_CROSSINGS_V067.some(c=>crossingPassageContainsV067(c,x,y));
      if(bridge)continue;
      wet++;if(!waterAtV067(x,y))invalid++;
      if(!waterAtV067(x-210,y)&&!waterAtV067(x+210,y))dry++;else invalid++;
    }
    return{wet,dry,invalid};
  });
  expect(errors).toEqual([]);
  expect(report.wet).toBeGreaterThan(35);
  expect(report.dry).toBe(report.wet);
  expect(report.invalid).toBe(0);
});
