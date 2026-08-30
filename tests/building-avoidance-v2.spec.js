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
    const b=createBuilding('france','house',1200,900,true);
    const u=createUnit('france','infantry',1040,900);
    u.targetX=1380;u.targetY=900;
    let minClear=Infinity;
    for(let i=0;i<720;i++){
      moveToward(u,u.targetX,u.targetY,1/60,TYPES.infantry.speed);
      const dx=Math.max(Math.abs(u.x-b.x)-b.w/2,0);
      const dy=Math.max(Math.abs(u.y-b.y)-b.h/2,0);
      minClear=Math.min(minClear,Math.hypot(dx,dy));
    }
    return {x:u.x,y:u.y,minClear,stats:window.__STUCK_RECOVERY_V2__.stats(),active:!!u.localAvoidanceV2};
  });
  expect(result.x).toBeGreaterThan(1320);
  expect(result.stats.localDetours).toBeGreaterThan(0);
  expect(result.stats.detourResumes).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('target inside a building is sanitized to reachable free ground', async ({page})=>{
  const errors=await openAvoidance(page);
  const result=await page.evaluate(()=>{
    const b=createBuilding('france','barracks',1500,1100,true);
    const u=createUnit('france','infantry',1320,1100);
    for(let i=0;i<480;i++) moveToward(u,b.x,b.y,1/60,TYPES.infantry.speed);
    const inside=Math.abs(u.x-b.x)<b.w/2+3 && Math.abs(u.y-b.y)<b.h/2+3;
    return {x:u.x,y:u.y,inside,distance:Math.hypot(u.x-b.x,u.y-b.y)};
  });
  expect(result.inside).toBe(false);
  expect(result.distance).toBeGreaterThan(30);
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
