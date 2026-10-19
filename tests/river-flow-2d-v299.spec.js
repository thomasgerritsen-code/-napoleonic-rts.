const {test,expect}=require('@playwright/test');

test('v299 current follows the river, flows faster midstream, and is continuous over time',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RIVER_FLOW_2D_V299__?.travelTimeFlow &&
    window.__RIVER_GEOMETRY_V296__ && window.__RIVER_BANKS_2D_V298__));
  const report=await page.evaluate(()=>{
    const api=window.__RIVER_FLOW_2D_V299__,geometry=window.__RIVER_GEOMETRY_V296__;
    const speed={
      mid:api.speedAt(2450,0),nearBank:api.speedAt(2450,.84),
      bendLeft:api.speedAt(2450,-.7),bendRight:api.speedAt(2450,.7)
    };
    const tracks=[];
    for(let i=0;i<75;i++){
      const p=api.sample(i,10),n=api.sample(i,10.05);
      const dir=geometry.tangentAt(p.centerY);
      const travel=(n.x-p.x)*dir.x+(n.y-p.y)*dir.y;
      const cross=Math.abs(p.x-geometry.centerAt(p.centerY));
      tracks.push({travel,step:Math.hypot(n.x-p.x,n.y-p.y),
        inWater:riverHitV067(p.x,p.y).distance<RIVER_NAV_HALF_WIDTH_V067,
        localSpeed:p.speed,lane:p.lane,cross});
    }
    const cameraBackup={x:camera.x,y:camera.y,zoom:camera.zoom};
    camera.x=geometry.centerAt(2600);camera.y=2600;camera.zoom=.8;
    const before=api.draw(3.1),after=api.draw(3.7),stats=api.metrics();
    camera.x=cameraBackup.x;camera.y=cameraBackup.y;camera.zoom=cameraBackup.zoom;
    const bridgeCheck=WATER_CROSSINGS_V067.map(c=>({
      id:c.id,wet:waterAtV067(c.x,c.y),
      centerOffset:Math.abs(geometry.centerAt(c.y)-c.x)
    }));
    return{speed,tracks,before,after,stats,bridgeCheck,
      flags:{twoDOnly:api.twoDOnly,
        travelTimeFlow:api.travelTimeFlow,shoreDrag:api.shoreDrag,
        bridgeEddies:api.bridgeEddies,curvatureResponsive:api.curvatureResponsive,
        particles:api.particleLimit},
      drawName:drawRiverV067.name};
  });
  expect(errors).toEqual([]);
  expect(report.flags).toEqual({
    twoDOnly:true,travelTimeFlow:true,
    shoreDrag:true,bridgeEddies:true,curvatureResponsive:true,
    particles:196
  });
  expect(report.speed.mid).toBeGreaterThan(report.speed.nearBank*1.5);
  expect(report.speed.mid).toBeLessThan(50);
  expect(report.tracks.every(t=>t.inWater)).toBe(true);
  expect(report.tracks.every(t=>t.step<4)).toBe(true);
  expect(report.tracks.filter(t=>t.travel>0).length).toBeGreaterThan(70);
  expect(report.tracks.some(t=>Math.abs(t.lane)<.1)).toBe(true);
  expect(report.before.visible).toBeGreaterThan(0);
  expect(report.after.visible).toBeGreaterThan(0);
  expect(report.stats.drawCalls).toBeLessThanOrEqual(250);
  expect(report.bridgeCheck).toHaveLength(5);
  for(const c of report.bridgeCheck){
    expect(c.wet).toBe(false);
    expect(c.centerOffset).toBeLessThan(5);
  }
  expect(report.drawName).toBe('drawRiverNatural2DV298');
});

test('v299 2D bridge wakes animate over the preserved river surface',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=movement-coverage',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__RIVER_FLOW_2D_V299__?.bridgeEddies &&
    window.__RIVER_SURFACE_V297__?.flowingRipples));
  const r=await page.evaluate(()=>{
    const api=window.__RIVER_FLOW_2D_V299__,river=window.__RIVER_SURFACE_V297__;
    const bridge=WATER_CROSSINGS_V067[0];
    const cam={x:camera.x,y:camera.y,zoom:camera.zoom};
    camera.x=bridge.x;camera.y=bridge.y;camera.zoom=1.2;
    const a=api.draw(4.2),b=api.draw(5.5);
    camera.x=cam.x;camera.y=cam.y;camera.zoom=cam.zoom;
    return{a,b,flow:river.flowingRipples,sample:river.flowSample(5,2),
      banks:window.__RIVER_BANKS_2D_V298__.twoDOnly};
  });
  expect(errors).toEqual([]);
  expect(r.a.wakes).toBeGreaterThanOrEqual(8);
  expect(r.b.wakes).toBeGreaterThanOrEqual(8);
  expect(r.flow).toBe(true);
  expect(r.sample).toBeTruthy();
  expect(r.banks).toBe(true);
});
