const {test,expect}=require('@playwright/test');

test('v298 only 2D bank rendering adds inside-bend bars and outer-bank erosion without changing river navigation',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RIVER_BANKS_2D_V298__?.twoDOnly &&
    window.__RIVER_GEOMETRY_V296__ && window.__RIVER_SURFACE_V297__));

  const state=await page.evaluate(()=>{
    const api=window.__RIVER_BANKS_2D_V298__,river=window.__RIVER_GEOMETRY_V296__;
    const choices=river.samples.map((p,i)=>({p,i,shape:api.bankShapeAt(i)}))
      .filter(p=>p.i>12&&p.i<river.samples.length-12&&!api.bridgeNear(p.p.y))
      .sort((a,b)=>b.shape.severity-a.shape.severity);
    const bend=choices[0],cam={x:camera.x,y:camera.y,zoom:camera.zoom};
    camera.x=bend.p.x;camera.y=bend.p.y;camera.zoom=.55;
    const visible=api.drawDetail();
    const timeA=window.__RIVER_SURFACE_V297__.flowSample(9,0);
    const timeB=window.__RIVER_SURFACE_V297__.flowSample(9,3);
    const bridges=WATER_CROSSINGS_V067.map(c=>({
      bridge:c.id,near:api.bridgeNear(c.y),crossing:crossingAtV067(c.x,c.y)?.id,
      water:waterAtV067(c.x,c.y)
    }));
    camera.x=cam.x;camera.y=cam.y;camera.zoom=cam.zoom;
    return{
      api:{twoDOnly:api.twoDOnly,threeDUntouched:api.threeDUntouched,
        sharedGeometry:api.sharedGeometry,erosionByBend:api.erosionByBend,
        drawName:drawRiverV067.name,
        stats:api.stats()},
      highestBend:bend.shape,visible,bridges,
      timeChanged:Math.hypot(timeA.x-timeB.x,timeA.y-timeB.y),
      v297DrawPreserved:typeof window.__RIVER_SURFACE_V297__.draw==='function',
      untouched3dScripts:Array.from(document.querySelectorAll('script[src*="battlefield-3d"]'))
        .map(s=>s.getAttribute('src')).filter(src=>src.includes('v297')).length
    };
  });
  expect(errors).toEqual([]);
  expect(state.api.twoDOnly).toBe(true);
  expect(state.api.threeDUntouched).toBe(true);
  expect(state.api.sharedGeometry).toBe(true);
  expect(state.api.erosionByBend).toBe(true);
  expect(state.api.drawName).toBe('drawRiverNatural2DV298');
  expect(state.api.stats.sampleCount).toBeGreaterThan(180);
  expect(state.highestBend.severity).toBeGreaterThan(.07);
  expect(state.highestBend.inside).toBe(-state.highestBend.outside);
  expect(state.visible.sediment).toBeGreaterThan(0);
  expect(state.visible.erosion).toBeGreaterThan(0);
  expect(state.visible.tufts).toBeGreaterThan(0);
  expect(state.timeChanged).toBeGreaterThan(1);
  expect(state.bridges).toHaveLength(5);
  for(const crossing of state.bridges){
    expect(crossing.near).toBe(true);
    expect(crossing.crossing).toBe(crossing.bridge);
    expect(crossing.water).toBe(false);
  }
  expect(state.v297DrawPreserved).toBe(true);
  expect(state.untouched3dScripts).toBeGreaterThanOrEqual(1);
});
