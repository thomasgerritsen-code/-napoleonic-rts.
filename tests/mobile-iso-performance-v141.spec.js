const {test,expect}=require('@playwright/test');
test.describe.configure({timeout:90000});
for(const viewport of [{width:390,height:844},{width:844,height:390},{width:1024,height:768}]){
 test(`mobile iso avoids GPU copies and HD decoding at ${viewport.width}x${viewport.height}`,async({browser})=>{
  const context=await browser.newContext({viewport,deviceScaleFactor:3,isMobile:true,hasTouch:true});
  const page=await context.newPage(),errors=[],hdRequests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/(?:fr|fr2)_iso_(?:infantry|combat|morale|fallen)_atlas\.webp$/.test(new URL(r.url()).pathname))hdRequests.push(r.url());});
  await page.addInitScript(()=>{
   window.testWebglRequests=0;const base=HTMLCanvasElement.prototype.getContext;
   HTMLCanvasElement.prototype.getContext=function(kind,...args){if(kind==='webgl2'||kind==='webgl')window.testWebglRequests++;return base.call(this,kind,...args);};
  });
  try{
   await page.goto('/?test=mobile-performance&view=iso');
   await page.waitForFunction(()=>window.__ISO_VIEW_V1__?.stats().assets.ready);
   const initial=await page.evaluate(()=>{
    for(let i=0;i<6;i++)createUnit('france','infantry',2300+i*20,1700);
    camera.x=2350;camera.y=1700;camera.zoom=1.55;
    for(let i=0;i<6;i++)window.renderStableFrameV1(()=>{},performance.now());
    const canvas=document.getElementById('game');return{
     gpu:window.__ISO_GPU_V1__.stats(),view:window.__ISO_VIEW_V1__.stats(),webglRequests:window.testWebglRequests,
     budget:window.__MOBILE_RENDER_BUDGET_V1__.state(),css:{width:canvas.getBoundingClientRect().width,height:canvas.getBoundingClientRect().height},
     previousPixels:Math.floor(innerWidth*2)*Math.floor(innerHeight*2)
    };
   });
   expect(initial.gpu.active).toBe(false);expect(initial.gpu.disabledReason).toBe('mobile-canvas');
   expect(initial.webglRequests).toBe(0);expect(initial.gpu.allocatedBytes).toBe(0);expect(initial.gpu.composites).toBe(0);
   expect(initial.budget.renderDpr).toBe(1.5);expect(initial.budget.nativeDpr).toBe(3);
   expect(initial.budget.backingPixels/initial.previousPixels).toBeLessThanOrEqual(.563);
   expect(initial.css.width).toBe(viewport.width);expect(initial.css.height).toBe(viewport.height);
   expect(initial.view.sprites).toBeGreaterThan(0);expect(initial.view.sharpSheets).toBe(0);expect(initial.view.sharpLoading).toBe(0);expect(initial.view.sharpBudgetMB).toBe(0);
   // Pinch/selection use CSS coordinates, independently of the smaller backing store.
   await page.setViewportSize({width:viewport.height,height:viewport.width});
   const after=await page.evaluate(()=>{
    for(let i=0;i<6;i++)window.renderStableFrameV1(()=>{},performance.now());
    const man=units.find(u=>!u.dead&&u.side==='france'&&u.type==='infantry');
    selectedUnits.clear();selectedBuilding=null;selectedUnits.add(man);
    const before={x:man.x,y:man.y};issueMoveWithFacingV06(man.x+100,man.y,.2);window.__RTS_DEBUG__.tick(2);
    const moved=Math.hypot(man.x-before.x,man.y-before.y)>5;
    resetGame();window.renderStableFrameV1(()=>{},performance.now());
    return{budget:window.__MOBILE_RENDER_BUDGET_V1__.state(),gpu:window.__ISO_GPU_V1__.stats(),view:window.__ISO_VIEW_V1__.stats(),moved,webglRequests:window.testWebglRequests};
   });
   expect(after.budget.renderDpr).toBe(1.5);expect(after.gpu.active).toBe(false);expect(after.webglRequests).toBe(0);
   expect(after.view.sharpSheets).toBe(0);expect(after.view.sharpLoading).toBe(0);expect(after.moved).toBe(true);
   expect(hdRequests).toEqual([]);expect(errors).toEqual([]);
  }finally{await context.close();}
 });
}
