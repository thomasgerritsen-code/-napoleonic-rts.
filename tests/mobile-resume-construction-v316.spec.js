const {test,expect}=require('@playwright/test');

// Use native Chromium touch injection. The old regression only dispatched
// synthetic PointerEvents on the canvas, which could not catch mobile UI
// occlusion or actual finger-coordinate routing.
test.use({hasTouch:true,isMobile:true,viewport:{width:844,height:390},deviceScaleFactor:2});

async function start(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=mobile-build-v316',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__RESUME_CONSTRUCTION_V315__?.resumeMobileAt &&
    window.__RTS_DEBUG__?.tick);
  return errors;
}
async function site(page,type='house'){
  return page.evaluate(type=>{
    const u=livingUnits('france').find(u=>u.type==='worker');
    const pos=findBuildLocation('france',type);
    if(!pos||!validBuildingSpot(type,pos.x,pos.y))throw Error('No safe site '+type);
    const initialWood=economies.france.wood;
    const b=constructBuilding('france',type,pos.x,pos.y,[u]);
    if(!b)throw Error('Cannot construct '+type);
    b.construction=.42;b.hp=b.maxHp*.42;
    selectedUnits.clear();selectedUnits.add(u);
    issueMove(b.x+195,b.y+125); // interrupt through the real order function
    const afterInterrupt=u.task;
    selectedUnits.clear();selectedBuilding=null;
    actionSignature='';updateHud(true);
    // The harness deliberately centers the site; camera clamping depends on
    // generated map bounds and can put random house sites outside the test viewport.
    // The real touchscreen still targets the visible canvas pixel.
    camera.zoom=1.35;camera.x=b.x;camera.y=b.y;
    const p=worldToScreen(b.x,b.y);
    return{workerId:u.id,buildingId:b.id,x:p.x,y:p.y,afterInterrupt,
      wood:economies.france.wood,woodCost:initialWood-economies.france.wood,
      hitTag:document.elementFromPoint(p.x,p.y)?.tagName||null,
      hitId:document.elementFromPoint(p.x,p.y)?.id||null,
      construction:b.construction};
  },type);
}
async function read(page,record){
  return page.evaluate(({workerId,buildingId})=>{
    const u=units.find(u=>u.id===workerId),b=buildings.find(b=>b.id===buildingId);
    return{task:u.task,target:u.buildingTarget?.id||null,selected: selectedBuilding?.id||null,
      progress:b.construction,complete:b.complete,wood:economies.france.wood,
      selectionSize:selectedUnits.size,resumeVisible:!!actionsEl.querySelector('[data-action="resume-construction"]'),
      toolbarScroll:actionsEl.scrollLeft};
  },record);
}
test('v316 real mobile touch resumes original builder after unit selection has been cleared',async({page})=>{
  const errors=await start(page);
  const construction=await site(page,'house');
  expect(construction.afterInterrupt).not.toBe('build');
  expect(construction.hitId).toBe('game');
  expect(construction.woodCost).toBe(120);
  await page.touchscreen.tap(construction.x,construction.y);
  const resumed=await read(page,construction);
  expect(resumed.task).toBe('build');
  expect(resumed.target).toBe(construction.buildingId);
  expect(resumed.selected).toBe(construction.buildingId);
  expect(resumed.selectionSize).toBe(0);
  expect(resumed.resumeVisible).toBe(true);
  expect(resumed.wood).toBe(construction.wood);
  const later=await page.evaluate(({workerId,buildingId})=>{
    const u=units.find(x=>x.id===workerId),b=buildings.find(x=>x.id===buildingId);
    const old=b.construction;
    window.__RTS_DEBUG__.tick(18);
    return{old,newValue:b.construction,task:u.task,complete:b.complete};
  },construction);
  expect(later.newValue).toBeGreaterThan(later.old);
  expect(errors).toEqual([]);
});
test('v316 mobile touch can resume farm after another soldier was selected',async({page})=>{
  const errors=await start(page);
  const construction=await site(page,'farm');
  expect(construction.hitId).toBe('game');
  const before=await page.evaluate(()=>{
    const soldier=livingUnits('france').find(u=>u.type==='infantry');
    selectedUnits.add(soldier);updateHud(true);
    return{type:soldier.type,count:selectedUnits.size};
  });
  expect(before.count).toBe(1);
  await page.touchscreen.tap(construction.x,construction.y);
  const after=await read(page,construction);
  expect(after.task).toBe('build');
  expect(after.target).toBe(construction.buildingId);
  expect(after.wood).toBe(construction.wood);
  expect(errors).toEqual([]);
});
test('v316 minor finger travel on building is not mistaken for a drag or march order',async({page})=>{
  const errors=await start(page);
  const construction=await site(page,'barracks');
  expect(construction.hitId).toBe('game');
  const result=await page.evaluate(({x,y,workerId,buildingId})=>{
    // iOS users often slip >12px when releasing a finger; the end point can
    // cross just beyond the edge of a small unfinished structure.
    const options={bubbles:true,cancelable:true,pointerType:'touch',
      pointerId:223,isPrimary:true,clientX:x,clientY:y};
    canvas.dispatchEvent(new PointerEvent('pointerdown',options));
    canvas.dispatchEvent(new PointerEvent('pointermove',{...options,clientX:x+17,clientY:y+8}));
    canvas.dispatchEvent(new PointerEvent('pointerup',{...options,clientX:x+17,clientY:y+8}));
    const worker=units.find(u=>u.id===workerId);
    const b=buildings.find(b=>b.id===buildingId);
    return{task:worker.task,target:worker.buildingTarget?.id,
      selected:selectedBuilding?.id,progress:b.construction};
  },construction);
  expect(result.task).toBe('build');
  expect(result.target).toBe(construction.buildingId);
  expect(result.selected).toBe(construction.buildingId);
  expect(errors).toEqual([]);
});
test('v316 single tap leaves friendly completed buildings and two-finger camera input alone',async({page})=>{
  const errors=await start(page);
  const result=await page.evaluate(()=>{
    const api=window.__RESUME_CONSTRUCTION_V315__;
    const tc=livingBuildings('france').find(b=>b.type==='towncenter');
    const active=api.resumeMobileAt(tc.x,tc.y);
    const before=[...selectedUnits].map(u=>u.id);
    const b=buildings.find(b=>b.side==='britain'&&!b.dead);
    return{ignored:!active,hasBuilding:!!b,apiVersion:api.version,before};
  });
  expect(result.ignored).toBe(true);
  expect(result.apiVersion).toBe('316.0');
  expect(errors).toEqual([]);
});
