const { test, expect } = require('@playwright/test');

test('Village landscape v7.1 adds archetype character and lived-in detail without changing navigation authority', async ({ page }) => {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?test=village-landscape-v7',{waitUntil:'networkidle'});
  await page.waitForFunction(()=>Boolean(
    window.__VILLAGE_LANDSCAPE_V7__ &&
    window.__VILLAGE_AUTHORITY_V6__ &&
    window.VILLAGE_SCENERY_V4
  ));

  const result=await page.evaluate(()=>{
    draw();
    const landscape=window.__VILLAGE_LANDSCAPE_V7__;
    const authority=window.__VILLAGE_AUTHORITY_V6__;
    const villages=window.VILLAGE_SCENERY_V4||[];
    return {
      landscape,
      authority,
      archetypes:[...new Set(villages.map(v=>v.archetype).filter(Boolean))],
      allRoadAccess:(villages.flatMap(v=>v.houses||[])).every(h=>Number.isFinite(h.accessX)&&Number.isFinite(h.accessY)),
      activeAuthority:drawHamletsV066.__nrtsVillageAuthority||null
    };
  });

  expect(result.landscape.version).toBe('village-landscape-v7.1');
  expect(result.landscape.base).toBe('village-landscape-v6');
  expect(result.landscape.archetypeLandmarks).toBe(true);
  expect(result.landscape.roadsideEdges).toBe(true);
  expect(result.landscape.sharedWell).toBe(true);
  expect(result.landscape.paddocks).toBe(true);
  expect(result.landscape.woodlandEdge).toBe(true);
  expect(result.landscape.accessGateHints).toBe(true);
  expect(result.landscape.commonFootpaths).toBe(true);
  expect(result.landscape.commonTree).toBe(true);
  expect(result.landscape.ribbonDitches).toBe(true);
  expect(result.landscape.paddockFurrows).toBe(true);
  expect(result.landscape.crossroadsWear).toBe(true);
  expect(result.landscape.importantGateposts).toBe(true);
  expect(result.landscape.navigationUnchanged).toBe(true);
  expect(result.authority.landscape).toBe('village-landscape-v6');
  expect(result.authority.landscapeCharacter).toBe('village-landscape-v7.1');
  expect(result.authority.archetypeCharacter).toBe(true);
  expect(result.activeAuthority).toBe('village-authority-v6');
  expect(result.archetypes.length).toBeGreaterThanOrEqual(4);
  expect(result.allRoadAccess).toBe(true);
  expect(errors).toEqual([]);
});
