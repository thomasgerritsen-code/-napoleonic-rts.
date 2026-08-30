const { test, expect } = require('@playwright/test');

test('Village V7 scales structures and routes units around roofs', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-v7',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__VILLAGE_SCALE_V7__ &&
    window.__VILLAGE_COLLISION_V4__ &&
    window.__VILLAGE_NAVIGATION_V7__
  ));

  const result=await page.evaluate(()=>{
    const scale=window.__VILLAGE_SCALE_V7__;
    const collision=window.__VILLAGE_COLLISION_V4__;
    const nav=window.__VILLAGE_NAVIGATION_V7__;
    const villages=window.VILLAGE_SCENERY_V4 || window.__VILLAGE_SCENERY_V4_DATA__;
    const houses=villages.flatMap(v=>v.houses);
    const house=houses[0];
    const radius=Math.hypot(house.w,house.h)*.5 + nav.routeMargin.infantry;
    const start={x:house.x-radius-90,y:house.y};
    const goal={x:house.x+radius+90,y:house.y};
    const direct=[goal];
    const avoided=nav.avoidPath(start,direct,'infantry');
    const safeGoal=nav.nearestOpenPoint({x:house.x,y:house.y},'infantry');
    const corrected=nav.resolveUnitPoint({x:house.x,y:house.y});
    return {
      scale,collision,
      navMeta:{
        version:nav.version,
        obstacleCount:nav.obstacleCount,
        blocksSceneryRoofs:nav.blocksSceneryRoofs,
        formationAwareRouting:nav.formationAwareRouting,
        finalTargetSanitization:nav.finalTargetSanitization,
        perUnitRoofGuard:nav.perUnitRoofGuard
      },
      maxW:Math.max(...houses.map(h=>h.w)),
      maxH:Math.max(...houses.map(h=>h.h)),
      directClear:nav.pathClear(start,direct,'infantry'),
      avoidedClear:nav.pathClear(start,avoided,'infantry'),
      avoidedWaypoints:avoided.length,
      safeGoalDistance:Math.hypot(safeGoal.x-house.x,safeGoal.y-house.y),
      corrected:corrected.corrected,
      correctedDistance:Math.hypot(corrected.point.x-house.x,corrected.point.y-house.y)
    };
  });

  expect(result.scale.version).toBe('village-scale-v7');
  expect(result.scale.structureScale).toBeCloseTo(0.72,5);
  expect(result.scale.soldierScaleCalibrated).toBe(true);
  expect(result.maxW).toBeLessThan(51);
  expect(result.maxH).toBeLessThan(28);

  expect(result.navMeta.version).toBe('village-navigation-v7');
  expect(result.navMeta.obstacleCount).toBe(result.collision.structureCount);
  expect(result.navMeta.blocksSceneryRoofs).toBe(true);
  expect(result.navMeta.formationAwareRouting).toBe(true);
  expect(result.navMeta.finalTargetSanitization).toBe(true);
  expect(result.navMeta.perUnitRoofGuard).toBe(true);

  expect(result.directClear).toBe(false);
  expect(result.avoidedClear).toBe(true);
  expect(result.avoidedWaypoints).toBeGreaterThan(1);
  expect(result.safeGoalDistance).toBeGreaterThan(20);
  expect(result.corrected).toBe(true);
  expect(result.correctedDistance).toBeGreaterThan(5);
  expect(errors).toEqual([]);
});
