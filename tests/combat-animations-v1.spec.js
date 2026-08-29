const { test, expect } = require('@playwright/test');

test('Combat Animations v1 follows combat events and stays visual-only', async ({ page }) => {
  const errors=[]; page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=v071',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(window.__COMBAT_ANIMATIONS_V1__&&window.NRTS?.subsystems.has('combat-animations')));
  const result=await page.evaluate(()=>{
    const api=window.__COMBAT_ANIMATIONS_V1__;
    const meta=window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='combat-animations')?.meta;
    const shooter=createUnit('france','infantry',1200,700);
    const target=createUnit('britain','infantry',1250,700);
    const before={x:shooter.x,y:shooter.y};
    fire(shooter,target);
    const anim=api.animationFor(shooter);
    drawUnit(shooter);
    const after={x:shooter.x,y:shooter.y};
    target.hp=1;
    applyDamage(target,2,0);
    return {version:api.version,features:[...api.features],meta,anim:anim?.kind||null,before,after,eventCount:api.eventCount(),targetDead:target.dead};
  });
  expect(result.version).toBe('combat-animations-v1');
  expect(result.meta?.phase).toBe('architecture-v2');
  expect(result.meta?.legacyBridge).toBe(false);
  expect(result.features).toContain('reload');
  expect(result.features).toContain('artillery-recoil');
  expect(result.features).toContain('death-fall');
  expect(result.anim).toBe('musket-fire');
  expect(result.after).toEqual(result.before);
  expect(result.targetDead).toBe(true);
  expect(result.eventCount).toBeGreaterThan(0);
  await page.evaluate(()=>window.RTS_SIM.step(.25));
  expect(errors).toEqual([]);
});
