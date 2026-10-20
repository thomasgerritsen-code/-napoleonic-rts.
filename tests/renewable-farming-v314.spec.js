const {test,expect}=require('@playwright/test');

async function start(page){
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=farming-v314',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__FARMING_V314__?.stats && window.__RTS_DEBUG__?.tick);
  return errors;
}
test('v314 graanakkers worden gebouwd op droge grond en geven zonder werkers geen gratis voedsel',async({page})=>{
  const errors=await start(page);
  const result=await page.evaluate(()=>{
    const farm=window.__FARMING_V314__;
    const location=findBuildLocation('france','farm',0);
    if(!location)throw Error('no safe field location');
    const valid=validBuildingSpot('farm',location.x,location.y);
    const b=createBuilding('france','farm',location.x,location.y,true);
    if(!b)throw Error('no field building');
    const before=economies.france.food;
    window.__RTS_DEBUG__.tick(6);
    const after=economies.france.food;
    return{
      valid,field:b.type,crop:b.cropStock,capacity:b.cropCapacity,
      foodDelta:after-before,woodCost:BUILDINGS.farm.cost.wood,
      insideRiver:window.__BATTLEFIELD_ECOLOGY_V1__.riverbankConflict('wood',b.x,b.y,70),
      ctx:window.__TOPDOWN_BUILDING_V307__.exactRoofGeometry,
      button:!!document.querySelector('[data-action="build-farm"]'),
      api:farm.stats()
    };
  });
  expect(result.valid).toBe(true);
  expect(result.field).toBe('farm');
  expect(result.crop).toBeGreaterThan(80);
  expect(result.crop).toBeLessThanOrEqual(result.capacity);
  expect(result.foodDelta).toBe(0);
  expect(result.woodCost).toBe(180);
  expect(result.insideRiver).toBe(false);
  expect(result.ctx).toBe(true);
  expect(result.button).toBe(true);
  expect(result.api.french).toBe(1);
  expect(errors).toEqual([]);
});

test('v314 een boer oogst hernieuwbaar graan en brengt het naar het eigen hoofdgebouw',async({page})=>{
  const errors=await start(page);
  const result=await page.evaluate(()=>{
    const p=findBuildLocation('france','farm');
    const field=createBuilding('france','farm',p.x,p.y,true);
    const farmer=livingUnits('france').find(u=>u.type==='worker');
    const home=nearestTownCenter('france',field.x,field.y);
    farmer.x=field.x+field.w/2+30;farmer.y=field.y;
    farmer.carry=0;farmer.carryType=null;
    const initial=field.cropStock;
    const before=economies.france.food;
    const accepted=window.__FARMING_V314__.assignWorker(farmer,field);
    window.__RTS_DEBUG__.tick(25);
    const foodReceived=economies.france.food-before;
    const stockAfter=field.cropStock;
    const activeBefore=farmer.task;
    window.__RTS_DEBUG__.tick(45);
    const moreFood=economies.france.food-before;
    return{accepted,foodReceived,moreFood,initial,stockAfter,activeBefore,
      farmerFarmId:farmer.farmId,fieldId:field.id,
      nearHome:!!home,capacity:field.cropCapacity,
      currentStock:field.cropStock};
  });
  expect(result.accepted).toBe(true);
  expect(result.nearHome).toBe(true);
  expect(result.foodReceived).toBeGreaterThanOrEqual(25);
  expect(result.moreFood).toBeGreaterThan(result.foodReceived);
  expect(result.initial).toBe(80);
  expect(result.currentStock).toBeGreaterThanOrEqual(0);
  expect(result.currentStock).toBeLessThanOrEqual(result.capacity);
  expect(result.farmerFarmId).toBe(result.fieldId);
  expect(['farm','farm-deliver']).toContain(result.activeBefore);
  expect(errors).toEqual([]);
});

test('v314 boer kan niet op vijandelijk veld werken en akker is niet meer beschikbaar na vernietiging',async({page})=>{
  await start(page);
  const s=await page.evaluate(()=>{
    const p=findBuildLocation('france','farm');
    const field=createBuilding('france','farm',p.x,p.y,true);
    const french=livingUnits('france').find(u=>u.type==='worker');
    const british=livingUnits('britain').find(u=>u.type==='worker');
    const denied=window.__FARMING_V314__.assignWorker(british,field);
    const accepted=window.__FARMING_V314__.assignWorker(french,field);
    field.dead=true;
    window.__RTS_DEBUG__.tick(.2);
    return{denied,accepted,task:french.task,farmId:french.farmId,
      live:window.__FARMING_V314__.getFarm(field.id),api:window.__FARMING_V314__.stats()};
  });
  expect(s.denied).toBe(false);
  expect(s.accepted).toBe(true);
  expect(s.task).not.toBe('farm');
  expect(s.live).toBeNull();
  expect(s.api.completed).toBe(0);
});

test('v314 het bouwmenu toont akkers en boeren kunnen er via mobiel actie op werken',async({page})=>{
  await page.setViewportSize({width:430,height:840});
  await start(page);
  const s=await page.evaluate(()=>{
    const worker=livingUnits('france').find(u=>u.type==='worker');
    selectedBuilding=null;
    selectedUnits.clear();selectedUnits.add(worker);
    actionSignature='';updateHud(true);
    const button=actionsEl.querySelector('[data-action="farm-assign"]');
    const p=findBuildLocation('france','farm');
    const field=createBuilding('france','farm',p.x,p.y,true);
    updateHud(true);
    const enabled=!actionsEl.querySelector('[data-action="farm-assign"]').disabled;
    actionsEl.querySelector('[data-action="farm-assign"]').click();
    return{button:!!button,enabled,task:worker.task,fieldId:field.id,workerField:worker.farmId};
  });
  expect(s.button).toBe(true);
  expect(s.enabled).toBe(true);
  expect(['farm','farm-deliver']).toContain(s.task);
  expect(s.workerField).toBe(s.fieldId);
});
