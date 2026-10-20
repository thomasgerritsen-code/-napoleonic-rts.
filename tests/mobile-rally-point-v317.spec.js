const {test,expect}=require('@playwright/test');

test.use({hasTouch:true,isMobile:true,viewport:{width:844,height:390},deviceScaleFactor:2});

async function launch(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=rally-v317',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>Boolean(window.__RTS_DEBUG__?.tick && typeof startRallyPlacementV06==='function' &&
    typeof finishRallyPlacementV06==='function' && window.__PLAYABILITY_CONTROLS_V1__?.mobile));
  return errors;
}
async function selectBarracksOrTown(page){
  return page.evaluate(()=>{
    const b=livingBuildings('france').find(b=>b.type==='towncenter'&&b.complete);
    if(!b)throw Error('Missing original player town center');
    selectedBuilding=b;selectedUnits.clear();actionSignature='';updateHud(true);
    // Use reproducible camera and leave the center clear of mobile HUD.
    camera.zoom=1;camera.x=b.x;camera.y=b.y;
    const point=worldToScreen(b.x+92,b.y+46);
    return{id:b.id,x:point.x,y:point.y,worldX:b.x+92,worldY:b.y+46,
      initialX:b.rallyX,initialY:b.rallyY,button:!!actionsEl.querySelector('[data-action="set-rally"]')};
  });
}
async function getState(page,id){
  return page.evaluate(id=>{
    const b=buildings.find(b=>b.id===id);
    return{x:b.rallyX,y:b.rallyY,pending:!!rallyPlacementBuilding,
      selected:selectedBuilding?.id,
      moves:window.__PLAYABILITY_CONTROLS_V1__.mobile.state().moveOrders,
      box:window.__PLAYABILITY_CONTROLS_V1__.mobile.state().boxSelections,
      mode:buildMode,
      button:!!actionsEl.querySelector('[data-action="set-rally"]')};
  },id);
}
async function touchDrag(page,start,end){
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',
    touchPoints:[{x:start.x,y:start.y,id:1}]});
  for(let n=1;n<=5;n++)await cdp.send('Input.dispatchTouchEvent',{
    type:'touchMove',touchPoints:[{
      x:start.x+(end.x-start.x)*n/5,
      y:start.y+(end.y-start.y)*n/5,id:1
    }]
  });
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
}

test('v317 landscape touchscreen: Verzamelpunt button accepts real finger tap, no march order',async({page})=>{
  const errors=await launch(page);
  const pos=await selectBarracksOrTown(page);
  expect(pos.button).toBe(true);
  const initial=await getState(page,pos.id);
  await page.locator('[data-action="set-rally"]').click();
  expect((await getState(page,pos.id)).pending).toBe(true);
  await page.touchscreen.tap(pos.x,pos.y);
  const after=await getState(page,pos.id);
  expect(after.pending).toBe(false);
  expect(after.x).toBeCloseTo(pos.worldX,2);
  expect(after.y).toBeCloseTo(pos.worldY,2);
  expect(after.moves).toBe(initial.moves);
  expect(after.box).toBe(initial.box);
  expect(after.selected).toBe(pos.id);
  expect(errors).toEqual([]);
});

test('v317 real one-finger drag on yellow rally flag moves it without opening orders',async({page})=>{
  const errors=await launch(page);
  const pos=await selectBarracksOrTown(page);
  const anchor=await page.evaluate(id=>{
    const b=buildings.find(b=>b.id===id);
    finishRallyPlacementV06(b.x+90,b.y+38,b);
    return worldToScreen(b.rallyX,b.rallyY);
  },pos.id);
  expect(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.id,anchor)).toBe('game');
  const before=await getState(page,pos.id);
  const to={x:anchor.x+55,y:anchor.y+45};
  await touchDrag(page,anchor,to);
  const after=await getState(page,pos.id);
  expect(after.x).toBeCloseTo(before.x+55,1);
  expect(after.y).toBeCloseTo(before.y+45,1);
  expect(after.pending).toBe(false);
  expect(after.moves).toBe(before.moves);
  expect(after.box).toBe(before.box);
  expect(errors).toEqual([]);
});

test('v317 portrait touchscreen can set the rally with one tap',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await launch(page);
  const pos=await selectBarracksOrTown(page);
  expect(pos.button).toBe(true);
  await page.locator('[data-action="set-rally"]').click();
  await page.touchscreen.tap(pos.x,pos.y);
  const state=await getState(page,pos.id);
  expect(state.pending).toBe(false);
  expect(state.x).toBeCloseTo(pos.worldX,1);
  expect(state.y).toBeCloseTo(pos.worldY,1);
  expect(errors).toEqual([]);
});

test('v317 two-finger camera gesture does not change a waiting rally order',async({page})=>{
  const errors=await launch(page);
  const pos=await selectBarracksOrTown(page);
  await page.locator('[data-action="set-rally"]').click();
  const before=await getState(page,pos.id);
  const cdp=await page.context().newCDPSession(page);
  const a={x:pos.x,y:pos.y,id:1},b={x:pos.x+80,y:pos.y,id:2};
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a,b]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[
    {...a,x:a.x-25},{...b,x:b.x+30}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await cdp.detach();
  const after=await getState(page,pos.id);
  expect(after.pending).toBe(true);
  expect(after.x).toBe(before.x);
  expect(after.y).toBe(before.y);
  expect(after.moves).toBe(before.moves);
  expect(errors).toEqual([]);
});

test('v317 mouse rally placement still works on desktop',async({page})=>{
  await page.setViewportSize({width:1280,height:800});
  const errors=await launch(page);
  const pos=await selectBarracksOrTown(page);
  await page.locator('[data-action="set-rally"]').click();
  await page.mouse.move(pos.x,pos.y);
  await page.mouse.click(pos.x,pos.y);
  const state=await getState(page,pos.id);
  expect(state.pending).toBe(false);
  expect(state.x).toBeCloseTo(pos.worldX,1);
  expect(state.y).toBeCloseTo(pos.worldY,1);
  expect(errors).toEqual([]);
});
