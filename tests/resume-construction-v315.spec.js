const {test,expect}=require('@playwright/test');

async function openGame(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=resume-build-v315',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__RTS_DEBUG__?.tick &&
    window.__RESUME_CONSTRUCTION_V315__?.resumePrevious);
  return errors;
}
async function newIncompleteBuilding(page,type='barracks'){
  return page.evaluate(type=>{
    const worker=livingUnits('france').find(u=>u.type==='worker');
    const location=findBuildLocation('france',type);
    if(!location||!validBuildingSpot(type,location.x,location.y))throw Error('No valid '+type+' construction spot');
    const beforeWood=economies.france.wood;
    const b=constructBuilding('france',type,location.x,location.y,[worker]);
    if(!b)throw Error('Construction failed for '+type);
    b.construction=.42;b.hp=.42*b.maxHp;
    selectedUnits.clear();selectedUnits.add(worker);selectedBuilding=null;
    actionSignature='';updateHud(true);
    return{workerId:worker.id,buildingId:b.id,originalProgress:b.construction,
      afterPayment:economies.france.wood,beforeWood,cost:BUILDINGS[type].cost.wood};
  },type);
}
test('v315 selecting unfinished barracks offers no-cost Resume and original builder continues',async({page})=>{
  const errors=await openGame(page);
  const setup=await newIncompleteBuilding(page);
  const outcome=await page.evaluate(({workerId,buildingId,afterPayment})=>{
    const u=units.find(u=>u.id===workerId),b=buildings.find(b=>b.id===buildingId);
    // User clicks elsewhere on map, interrupting the build command.
    issueMove(b.x+210,b.y+105);
    const interrupted=u.task!=='build';
    const formerJob=u.lastConstructionId;
    selectPoint(b.x,b.y,false);
    const button=actionsEl.querySelector('[data-action="resume-construction"]');
    const found=!!button&&!button.disabled;
    button?.click();
    const resumed=u.task==='build'&&u.buildingTarget===b;
    const costUnchanged=economies.france.wood===afterPayment;
    const progressBefore=b.construction;
    u.x=b.x;u.y=b.y;
    window.__RTS_DEBUG__.tick(1.5);
    return{interrupted,formerJob,found,resumed,costUnchanged,
      progressBefore,progressAfter:b.construction,
      sameBuilding:buildings.filter(x=>x.id===b.id).length===1,
      version:window.RTS_VERSION};
  },setup);
  expect(setup.beforeWood-setup.afterPayment).toBe(setup.cost);
  expect(outcome.interrupted).toBe(true);
  expect(outcome.formerJob).toBe(setup.buildingId);
  expect(outcome.found).toBe(true);
  expect(outcome.resumed).toBe(true);
  expect(outcome.costUnchanged).toBe(true);
  expect(outcome.progressAfter).toBeGreaterThan(outcome.progressBefore);
  expect(outcome.sameBuilding).toBe(true);
  expect(outcome.version).toBe('1.3.63');
  expect(errors).toEqual([]);
});

test('v315 right-click unfinished building resumes selected farmer instead of moving',async({page})=>{
  const errors=await openGame(page);
  const setup=await newIncompleteBuilding(page);
  const point=await page.evaluate(({workerId,buildingId})=>{
    const u=units.find(x=>x.id===workerId),b=buildings.find(x=>x.id===buildingId);
    issueMove(b.x+200,b.y+120);
    // A central, unobscured canvas click tests actual desktop pointer input.
    // Zooming in ensures the building does not land underneath the HUD.
    camera.zoom=1.25;camera.x=b.x;camera.y=b.y;clampCamera();
    const p=worldToScreen(b.x,b.y);
    const target=document.elementFromPoint(p.x,p.y);
    return {x:p.x,y:p.y,taskBefore:u.task,buildingId:b.id,
      hitTag:target?.tagName||null,hitId:target?.id||null};
  },setup);
  expect(point.taskBefore).not.toBe('build');
  expect(point.hitId).toBe('game');
  await page.mouse.click(point.x,point.y,{button:'right'});
  const state=await page.evaluate(({workerId,buildingId})=>{
    const u=units.find(x=>x.id===workerId);
    return{task:u.task,buildingTarget:u.buildingTarget?.id,buildingId,selected:selectedUnits.has(u)};
  },setup);
  expect(state.task).toBe('build');
  expect(state.buildingTarget).toBe(state.buildingId);
  expect(state.selected).toBe(true);
  expect(errors).toEqual([]);
});

test('v315 mobile one-finger tap on an incomplete farm resumes farmers after a map move',async({page})=>{
  await page.setViewportSize({width:430,height:840});
  const errors=await openGame(page);
  const setup=await newIncompleteBuilding(page,'farm');
  const state=await page.evaluate(({workerId,buildingId,afterPayment})=>{
    const u=units.find(x=>x.id===workerId),b=buildings.find(x=>x.id===buildingId);
    issueMove(b.x+160,b.y+130);
    camera.x=b.x;camera.y=b.y;clampCamera();
    const p=worldToScreen(b.x,b.y);
    const opts={bubbles:true,cancelable:true,pointerType:'touch',pointerId:95,
      isPrimary:true,clientX:p.x,clientY:p.y};
    canvas.dispatchEvent(new PointerEvent('pointerdown',opts));
    canvas.dispatchEvent(new PointerEvent('pointerup',opts));
    return{task:u.task,targetId:u.buildingTarget?.id,selected:selectedUnits.has(u),
      food:economies.france.food,wood:economies.france.wood,
      noRepay:economies.france.wood===afterPayment,stillIncomplete:!b.complete,
      mobileOrders:window.__PLAYABILITY_CONTROLS_V1__?.mobile?.stats?.()?.moveOrders??null};
  },setup);
  expect(state.task).toBe('build');
  expect(state.targetId).toBe(setup.buildingId);
  expect(state.selected).toBe(true);
  expect(state.noRepay).toBe(true);
  expect(state.stillIncomplete).toBe(true);
  expect(errors).toEqual([]);
});

test('v315 destroyed or completed buildings cannot receive resume instructions',async({page})=>{
  await openGame(page);
  const setup=await newIncompleteBuilding(page);
  const result=await page.evaluate(({workerId,buildingId})=>{
    const u=units.find(x=>x.id===workerId),b=buildings.find(x=>x.id===buildingId);
    u.task=null;u.buildingTarget=null;
    b.complete=true;
    const finished=window.__RESUME_CONSTRUCTION_V315__.resumeWorkers(b,[u]);
    b.complete=false;b.dead=true;
    const destroyed=window.__RESUME_CONSTRUCTION_V315__.resumeWorkers(b,[u]);
    return{finished,destroyed,task:u.task};
  },setup);
  expect(result.finished).toBe(0);
  expect(result.destroyed).toBe(0);
  expect(result.task).toBeNull();
});
