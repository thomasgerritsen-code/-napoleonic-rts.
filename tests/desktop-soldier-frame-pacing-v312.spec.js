const {test,expect}=require('@playwright/test');

test('v312 desktop animation clock interpolates between 60 Hz simulation steps',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/play.html',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.RTS_SIM && !!window.__GPU_UNITS_V304__);
  const samples=await page.evaluate(async()=>{
    const original=draw,observed=[];
    draw=function observedVisualClockV312(){
      const c=window.__NRTS_RENDER_CLOCK_V312__;
      if(c)observed.push({visual:c.simulationTime,simulation:elapsed,
        wall:c.wallTime});
      return original.apply(this,arguments);
    };
    try{await new Promise(resolve=>setTimeout(resolve,350));}
    finally{draw=original;}
    return observed;
  });
  expect(samples.length).toBeGreaterThan(1);
  expect(samples.every(s=>Number.isFinite(s.visual)&&Number.isFinite(s.wall))).toBe(true);
  expect(samples.every(s=>s.visual>=0&&s.visual<=s.simulation+.00001)).toBe(true);
  expect(samples.some(s=>s.visual<s.simulation-.0001)).toBe(true);
  for(let i=1;i<samples.length;i++){
    expect(samples[i].wall).toBeGreaterThan(samples[i-1].wall);
    expect(samples[i].visual+.00001).toBeGreaterThanOrEqual(samples[i-1].visual);
  }
  expect(errors).toEqual([]);
});

test('v312 GPU footsteps do not alternate to idle on consecutive render-only frames',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!window.__GPU_UNITS_V304__ && !!window.__LARGE_ARMY_PERFORMANCE_V1__);
  const result=await page.evaluate(()=>{
    const perf=window.__LARGE_ARMY_PERFORMANCE_V1__;
    const gpu=window.__GPU_UNITS_V304__;
    const x=camera.x,y=camera.y;
    while(units.filter(u=>!u.dead).length<390){
      const n=units.length;
      createUnit('france','infantry',x+(n%22)*10-110,y+(Math.floor(n/22)%20)*10-100);
    }
    camera.zoom=.68;
    perf.prepareFrameIndexes();
    const moving=units.find(u=>u.side==='france'&&u.type==='infantry'&&
      !selectedUnits.has(u)&&Math.hypot(u.x-x,u.y-y)<120);
    const now=performance.now()/1000;
    function drawAt(wall,delta){
      moving.x+=delta;
      window.__NRTS_RENDER_CLOCK_V312__={simulationTime:elapsed,wallTime:wall};
      try{draw();}
      finally{window.__NRTS_RENDER_CLOCK_V312__=null;}
      return gpu.metrics();
    }
    const before=drawAt(now,0);
    const first=drawAt(now+.008,1);
    const second=drawAt(now+.016,1);
    return{active:before.active,firstAdded:first.animatedSoldiers-before.animatedSoldiers,
      secondAdded:second.animatedSoldiers-first.animatedSoldiers,
      drawCalls:second.drawCalls-before.drawCalls,errors:second.failures};
  });
  if(result.active){
    expect(result.firstAdded).toBeGreaterThan(0);
    expect(result.secondAdded).toBeGreaterThan(0);
    expect(result.drawCalls).toBe(2);
    expect(result.errors).toBe(0);
  }else expect(result.drawCalls).toBe(0);
  expect(errors).toEqual([]);
});
