const { test, expect } = require('@playwright/test');

test('Village V7 enlarges structures, expands the map and routes units around roofs', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-v7',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__BATTLEFIELD_EXPANSION_V7__ &&
    window.__VILLAGE_SCALE_V7__ &&
    window.__VILLAGE_COLLISION_V4__ &&
    window.__VILLAGE_NAVIGATION_V7__
  ));

  const result=await page.evaluate(()=>{
    const battlefield=window.__BATTLEFIELD_EXPANSION_V7__;
    const scale=window.__VILLAGE_SCALE_V7__;
    const collision=window.__VILLAGE_COLLISION_V4__;
    const nav=window.__VILLAGE_NAVIGATION_V7__;
    const villages=window.VILLAGE_SCENERY_V4 || window.__VILLAGE_SCENERY_V4_DATA__;
    const houses=villages.flatMap(v=>v.houses);
    const house=houses[0];
    const radius=Math.hypot(house.w,house.h)*.5 + nav.routeMargin.infantry;
    const start={x:house.x-radius-110,y:house.y};
    const goal={x:house.x+radius+110,y:house.y};
    const direct=[goal];
    const avoided=nav.avoidPath(start,direct,'infantry');
    const safeGoal=nav.nearestOpenPoint({x:house.x,y:house.y},'infantry');
    const corrected=nav.resolveUnitPoint({x:house.x,y:house.y});
    return {
      battlefield,scale,collision,
      activeRoadIds:(window.NRTS_ROAD_NETWORK_V7||[]).map(r=>r.id),
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

  expect(result.battlefield.version).toBe('battlefield-expansion-v7');
  expect(result.battlefield.width).toBeGreaterThanOrEqual(4300);
  expect(result.battlefield.height).toBeGreaterThanOrEqual(2500);
  expect(result.battlefield.roadCount).toBeLessThan(result.battlefield.originalRoadCount);
  expect(result.battlefield.sparserRoadNetwork).toBe(true);
  expect(result.activeRoadIds).not.toContain('chemin-de-la-crete-ouest');
  expect(result.activeRoadIds).not.toContain('voie-du-verger');

  expect(result.scale.version).toBe('village-scale-v7');
  expect(result.scale.structureScale).toBeCloseTo(1.22,5);
  expect(result.scale.soldierScaleCalibrated).toBe(true);
  expect(result.scale.enlargedStructures).toBe(true);
  expect(result.maxW).toBeGreaterThan(65);
  expect(result.maxW).toBeLessThan(90);
  expect(result.maxH).toBeGreaterThan(30);
  expect(result.maxH).toBeLessThan(48);

  expect(result.navMeta.version).toBe('village-navigation-v7');
  expect(result.navMeta.obstacleCount).toBe(result.collision.structureCount);
  expect(result.navMeta.blocksSceneryRoofs).toBe(true);
  expect(result.navMeta.formationAwareRouting).toBe(true);
  expect(result.navMeta.finalTargetSanitization).toBe(true);
  expect(result.navMeta.perUnitRoofGuard).toBe(true);

  expect(result.directClear).toBe(false);
  expect(result.avoidedClear).toBe(true);
  expect(result.avoidedWaypoints).toBeGreaterThan(1);
  expect(result.safeGoalDistance).toBeGreaterThan(30);
  expect(result.corrected).toBe(true);
  expect(result.correctedDistance).toBeGreaterThan(8);
  expect(errors).toEqual([]);
});
