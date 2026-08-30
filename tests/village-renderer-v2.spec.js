const { test, expect } = require('@playwright/test');

test('villages are globally separated and block gameplay building placement', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-v4',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__VILLAGE_COLLISION_V4__ &&
    window.__VILLAGE_RENDERER_V2__ &&
    window.__VILLAGE_AUTHORITY_V4__ &&
    window.NRTS?.subsystems.has('building-placement')
  ));

  const result=await page.evaluate(()=>{
    draw();
    const collision=window.__VILLAGE_COLLISION_V4__;
    const renderer=window.__VILLAGE_RENDERER_V2__;
    const authority=window.__VILLAGE_AUTHORITY_V4__;
    const placement=window.NRTS.subsystems.get('building-placement');
    const sample=collision.sampleObstacle;
    const sampleBlocked=sample ? !placement.validSpot('house',sample.x,sample.y) : false;
    const safe=sample ? placement.nearestSafe('house',sample.x,sample.y) : null;
    const safeValid=safe ? placement.validSpot('house',safe.x,safe.y) : false;
    return {
      collision,renderer,authority,
      activeAuthority:drawHamletsV066.__nrtsVillageAuthority || null,
      sampleBlocked,safe,safeValid,
      placementObstacleCount:placement.villageObstacleCount
    };
  });

  expect(result.collision.version).toBe('village-collision-v4');
  expect(result.collision.globalSeparation).toBe(true);
  expect(result.collision.includesRenderedYards).toBe(true);
  expect(result.collision.structureCount).toBeGreaterThan(20);
  expect(result.collision.overlapCount).toBe(0);
  expect(result.collision.minPlotGap).toBeGreaterThanOrEqual(9.99);

  expect(result.renderer.version).toBe('village-renderer-v2');
  expect(result.renderer.projection).toBe('orthographic-top-down');
  expect(result.renderer.visibleFacades).toBe(false);
  expect(result.renderer.yardDetails).toBe(true);

  expect(result.authority.version).toBe('village-authority-v4');
  expect(result.authority.overridesLegacyV070).toBe(true);
  expect(result.authority.collisionSafe).toBe(true);
  expect(result.activeAuthority).toBe('village-authority-v4');

  expect(result.sampleBlocked).toBe(true);
  expect(result.safe).not.toBeNull();
  expect(result.safeValid).toBe(true);
  expect(result.placementObstacleCount).toBe(result.collision.structureCount);
  expect(errors).toEqual([]);
});
