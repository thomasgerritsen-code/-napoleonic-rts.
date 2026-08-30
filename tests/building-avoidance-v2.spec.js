const { test, expect } = require('@playwright/test');

async function openAvoidance(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=avoid2',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__STUCK_RECOVERY_V2__ && window.__VILLAGE_NAVIGATION_V7__));
  return errors;
}

test('loose unit locally detours around a gameplay building instead of sticking', async ({page})=>{
  const errors=await openAvoidance(page);
  const result=await page.evaluate(()=>{
    const b=createBuilding('france','house',1600,1250,true);
    if(!b) return {missing:true};
    const start={x:Math.max(40,b.x-180),y:b.y};
    const target={x:Math.min(WORLD.width-40,b.x+180),y:b.y};
    const u=createUnit('france','infantry',start.x,start.y);
    u.targetX=target.x;u.targetY=target.y;
    let minClear=Infinity,maxLateral=0;
    for(let i=0;i<720;i++){
      moveToward(u,u.targetX,u.targetY,1/60,TYPES.infantry.speed);
      const dx=Math.max(Math.abs(u.x-b.x)-b.w/2,0);
      const dy=Math.max(Math.abs(u.y-b.y)-b.h/2,0);
      minClear=Math.min(minClear,Math.hypot(dx,dy));
      maxLateral=Math.max(maxLateral,Math.abs(u.y-b.y));
    }
    return {
      missing:false,x:u.x,y:u.y,targetX:target.x,minClear,maxLateral,
      building:{x:b.x,y:b.y,w:b.w,h:b.h},
      stats:window.__STUCK_RECOVERY_V2__.stats(),active:!!u.localAvoidanceV2
    };
  });
  expect(result.missing).toBe(false);
  expect(result.x).toBeGreaterThan(result.targetX-60);
  expect(result.maxLateral).toBeGreaterThan(result.building.h/2);
  expect(result.stats.localDetours).toBeGreaterThan(0);
  expect(result.stats.detourResumes).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('target inside a building is sanitized to reachable free ground', async ({page})=>{
  const errors=await openAvoidance(page);
  const result=await page.evaluate(()=>{
    const b=createBuilding('france','barracks',1900,1350,true);
    if(!b) return {missing:true};
    const u=createUnit('france','infantry',Math.max(40,b.x-180),b.y);
    for(let i=0;i<480;i++) moveToward(u,b.x,b.y,1/60,TYPES.infantry.speed);
    const inside=Math.abs(u.x-b.x)<b.w/2+3 && Math.abs(u.y-b.y)<b.h/2+3;
    return {missing:false,x:u.x,y:u.y,inside,distance:Math.hypot(u.x-b.x,u.y-b.y),w:b.w,h:b.h};
  });
  expect(result.missing).toBe(false);
  expect(result.inside).toBe(false);
  expect(result.distance).toBeGreaterThan(Math.min(result.w,result.h)/2);
  expect(errors).toEqual([]);
});

test('stuck recovery v2 exposes local avoidance contract', async ({page})=>{
  await openAvoidance(page);
  const api=await page.evaluate(()=>({
    version:window.__STUCK_RECOVERY_V2__.version,
    localBuildingAvoidance:window.__STUCK_RECOVERY_V2__.localBuildingAvoidance,
    formationSlotResume:window.__STUCK_RECOVERY_V2__.formationSlotResume,
    config:window.NRTS_CONFIG.movement.stuckRecovery.localAvoidance
  }));
  expect(api.version).toBe('stuck-recovery-v2');
  expect(api.localBuildingAvoidance).toBe(true);
  expect(api.formationSlotResume).toBe(true);
  expect(api.config.cornerClearance).toBeGreaterThan(api.config.clearance);
});
