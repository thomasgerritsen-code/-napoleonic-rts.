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
    const villages=window.VILLAGE_SCENERY_V4 || window.__VILLAGE_SCENERY_V4_DATA__ || [];
    const houses=villages.flatMap(v=>v.houses || []);
    const activeRoadNames=new Set((window.NRTS_ROAD_NETWORK_V7 || []).map(r=>r.name));
    const sharedGroups=new Map();
    for(const village of villages){
      for(const house of village.houses || []){
        if(!house.sharedYardId) continue;
        const key=`${village.name}:${house.sharedYardId}`;
        sharedGroups.set(key,(sharedGroups.get(key)||0)+1);
      }
    }
    const sample=collision.sampleObstacle;
    const sampleBlocked=sample ? !placement.validSpot('house',sample.x,sample.y) : false;
    const safe=sample ? placement.nearestSafe('house',sample.x,sample.y) : null;
    const safeValid=safe ? placement.validSpot('house',safe.x,safe.y) : false;
    return {
      layout,collision,renderer,yardBlend,landscape,authority,
      activeAuthority:drawHamletsV066.__nrtsVillageAuthority || null,
      sampleBlocked,safe,safeValid,
      placementObstacleCount:placement.villageObstacleCount,
      sharedGroupCount:sharedGroups.size,
      pairedSharedGroupCount:[...sharedGroups.values()].filter(count=>count>1).length,
      roadAccessCount:houses.filter(h=>Number.isFinite(h.accessX)&&Number.isFinite(h.accessY)&&Number.isFinite(h.roadClearance)).length,
      clusteredHouseCount:houses.filter(h=>Boolean(h.clusterId&&h.sharedYardId)).length,
      inactiveRoadReferenceCount:houses.filter(h=>activeRoadNames.size&&!activeRoadNames.has(h.roadName)).length,
      totalCanonicalHouses:houses.length
    };
  });

  expect(result.layout.version).toBe('village-layout-v6');
  expect(result.layout.model).toBe('core-residential-farm-edge');
  expect(result.layout.hierarchical).toBe(true);
  expect(result.layout.roadOriented).toBe(true);
  expect(result.layout.farmCompounds).toBe(true);
  expect(result.layout.clusteredFrontages).toBe(true);
  expect(result.layout.sharedYardGroups).toBe(true);
  expect(result.layout.roadAccessMetadata).toBe(true);
  expect(result.layout.curvedRoadAlignment).toBe(true);
  expect(result.layout.deterministicFabric).toBe(true);
  expect(result.layout.villageCount).toBeGreaterThanOrEqual(4);
  expect(result.layout.structureCount).toBeGreaterThan(result.layout.villageCount*8);
  expect(result.layout.compoundCount).toBeGreaterThanOrEqual(result.layout.villageCount*2);
  expect(result.layout.frontageGroupCount).toBeGreaterThan(result.layout.villageCount);
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
  expect(result.yardBlend.sharedHouseholdBlend).toBe(true);
  expect(result.yardBlend.sharedBoundarySuppression).toBe(true);

  expect(result.landscape.version).toBe('village-landscape-v6');
  expect(result.landscape.sharedGround).toBe(true);
  expect(result.landscape.footpaths).toBe(true);
  expect(result.landscape.agriculturalFringe).toBe(true);
  expect(result.landscape.individualPlotDominance).toBe(false);
  expect(result.landscape.clusterCommons).toBe(true);
  expect(result.landscape.roadFrontageConnections).toBe(true);
  expect(result.landscape.continuousVillageFabric).toBe(true);
  expect(result.landscape.postCollisionPathAnchoring).toBe(true);
  expect(result.landscape.activeRoadNetworkAware).toBe(true);

  expect(result.sharedGroupCount).toBeGreaterThan(result.layout.villageCount);
  expect(result.pairedSharedGroupCount).toBeGreaterThanOrEqual(result.layout.villageCount*3);
  expect(result.roadAccessCount).toBe(result.totalCanonicalHouses);
  expect(result.clusteredHouseCount).toBe(result.totalCanonicalHouses);
  expect(result.inactiveRoadReferenceCount).toBe(0);

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
