const { test, expect } = require('@playwright/test');

test('Village V6 uses hierarchy, shared landscape and collision-safe placement', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-v6',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__VILLAGE_LAYOUT_V6__ &&
    window.__VILLAGE_COLLISION_V4__ &&
    window.__VILLAGE_RENDERER_V2__ &&
    window.__VILLAGE_YARD_BLEND_V5__ &&
    window.__VILLAGE_LANDSCAPE_V6__ &&
    window.__VILLAGE_AUTHORITY_V6__ &&
    window.NRTS?.subsystems.has('building-placement')
  ));

  const result=await page.evaluate(()=>{
    draw();
    const layout=window.__VILLAGE_LAYOUT_V6__;
    const collision=window.__VILLAGE_COLLISION_V4__;
    const renderer=window.__VILLAGE_RENDERER_V2__;
    const yardBlend=window.__VILLAGE_YARD_BLEND_V5__;
    const landscape=window.__VILLAGE_LANDSCAPE_V6__;
    const authority=window.__VILLAGE_AUTHORITY_V6__;
    const placement=window.NRTS.subsystems.get('building-placement');
    const sample=collision.sampleObstacle;
    const sampleBlocked=sample ? !placement.validSpot('house',sample.x,sample.y) : false;
    const safe=sample ? placement.nearestSafe('house',sample.x,sample.y) : null;
    const safeValid=safe ? placement.validSpot('house',safe.x,safe.y) : false;
    return {
      layout,collision,renderer,yardBlend,landscape,authority,
      activeAuthority:drawHamletsV066.__nrtsVillageAuthority || null,
      sampleBlocked,safe,safeValid,
      placementObstacleCount:placement.villageObstacleCount
    };
  });

  expect(result.layout.version).toBe('village-layout-v6');
  expect(result.layout.model).toBe('core-residential-farm-edge');
  expect(result.layout.hierarchical).toBe(true);
  expect(result.layout.roadOriented).toBe(true);
  expect(result.layout.farmCompounds).toBe(true);
  expect(result.layout.villageCount).toBeGreaterThanOrEqual(4);
  expect(result.layout.structureCount).toBeGreaterThan(result.layout.villageCount*8);
  expect(result.layout.compoundCount).toBeGreaterThanOrEqual(result.layout.villageCount*2);
  expect(result.layout.zones.core).toBeGreaterThan(0);
  expect(result.layout.zones.residential).toBeGreaterThan(0);
  expect(result.layout.zones['farm-edge']).toBeGreaterThan(0);

  expect(result.collision.version).toBe('village-collision-v4');
  expect(result.collision.sourceVersion).toBe('village-layout-v6');
  expect(result.collision.globalSeparation).toBe(true);
  expect(result.collision.includesRenderedYards).toBe(true);
  expect(result.collision.structureCount).toBeGreaterThan(20);
  expect(result.collision.overlapCount).toBe(0);
  expect(result.collision.minPlotGap).toBeGreaterThanOrEqual(9.99);
  expect(result.collision.zones.core).toBeGreaterThan(0);
  expect(result.collision.zones.residential).toBeGreaterThan(0);
  expect(result.collision.zones['farm-edge']).toBeGreaterThan(0);

  expect(result.renderer.version).toBe('village-renderer-v2');
  expect(result.renderer.projection).toBe('orthographic-top-down');
  expect(result.renderer.visibleFacades).toBe(false);

  expect(result.yardBlend.version).toBe('village-yard-blend-v5');
  expect(result.yardBlend.fullRectBoundaries).toBe(false);
  expect(result.yardBlend.v6ZoneAware).toBe(true);
  expect(result.yardBlend.coreBoundariesSuppressed).toBe(true);
  expect(result.yardBlend.residentialSideBoundariesSuppressed).toBe(true);
  expect(result.yardBlend.collisionGeometryUnchanged).toBe(true);

  expect(result.landscape.version).toBe('village-landscape-v6');
  expect(result.landscape.sharedGround).toBe(true);
  expect(result.landscape.footpaths).toBe(true);
  expect(result.landscape.agriculturalFringe).toBe(true);
  expect(result.landscape.individualPlotDominance).toBe(false);

  expect(result.authority.version).toBe('village-authority-v6');
  expect(result.authority.sourceLayout).toBe('village-layout-v6');
  expect(result.authority.collisionSafe).toBe(true);
  expect(result.authority.hierarchical).toBe(true);
  expect(result.authority.naturalVillageFabric).toBe(true);
  expect(result.authority.landscape).toBe('village-landscape-v6');
  expect(result.activeAuthority).toBe('village-authority-v6');

  expect(result.sampleBlocked).toBe(true);
  expect(result.safe).not.toBeNull();
  expect(result.safeValid).toBe(true);
  expect(result.placementObstacleCount).toBe(result.collision.structureCount);
  expect(errors).toEqual([]);
});
