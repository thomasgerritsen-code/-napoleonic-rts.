const {test,expect}=require('@playwright/test');

// Visual-only update: preserve the authoritative road and river geometry and
// ensure the same deterministic rendering layer loads on phone and desktop.
async function boot(page){
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/?test=painterly-v318',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__MAP_REALISM_V2__?.painterlyTerrain &&
    window.__RIVER_SURFACE_V297__?.sharedGeometry &&
    window.__RTS_DEBUG__?.tick);
  return errors;
}

test('v318 painterly landscape has a calm historic palette and world-anchored detail',async({page})=>{
  const errors=await boot(page);
  const r=await page.evaluate(()=>{
    const m=window.__MAP_REALISM_V2__;
    const road=window.NRTS_ROAD_NETWORK_V7||ROAD_NETWORK_V066;
    const roadBefore=JSON.stringify(road.map(r=>({id:r.id,width:r.width,
      points:r.points.map(p=>[p.x,p.y])})));
    const bridgeBefore=JSON.stringify(WATER_CROSSINGS_V067);
    const riverBefore=JSON.stringify(window.__RIVER_GEOMETRY_V296__.samples);
    const buildingBefore=buildings.length,unitBefore=units.length;
    draw();
    camera.x+=42;camera.y+=28;draw();
    camera.x-=42;camera.y-=28;draw();
    return{
      palette:m.painterlyPalette,style:m.version,
      painterly:m.painterlyTerrain,brushes:m.brushStampCount,tufts:m.meadowTuftCount,
      worldAnchored:m.worldAnchoredBrushwork,ruts:m.roadRutsTangentAligned,
      roadCount:m.roadCount,
      roadUnchanged:JSON.stringify(road.map(r=>({id:r.id,width:r.width,
        points:r.points.map(p=>[p.x,p.y])})))===roadBefore,
      bridgesUnchanged:JSON.stringify(WATER_CROSSINGS_V067)===bridgeBefore,
      riverUnchanged:JSON.stringify(window.__RIVER_GEOMETRY_V296__.samples)===riverBefore,
      buildingsUnchanged:buildings.length===buildingBefore,
      unitsUnchanged:units.length===unitBefore,
      twoD:window.__RIVER_FLOW_2D_V299__.twoDOnly,
      navigationPreserved:m.preservesNavigation,
      roadClearance:m.roadClearance2D,
      worldBounds:m.visibleBounds()
    };
  });
  expect(r.palette.meadow).toBe('#6d7959');
  expect(r.palette.roadMain).toContain('184,158,116');
  expect(r.style).toContain('painterly-historic');
  expect(r.painterly).toBe(true);
  expect(r.brushes).toBe(1550);
  expect(r.tufts).toBe(1650);
  expect(r.worldAnchored).toBe(true);
  expect(r.ruts).toBe(true);
  expect(r.roadCount).toBeGreaterThan(2);
  expect(r.roadUnchanged).toBe(true);
  expect(r.bridgesUnchanged).toBe(true);
  expect(r.riverUnchanged).toBe(true);
  expect(r.buildingsUnchanged).toBe(true);
  expect(r.unitsUnchanged).toBe(true);
  expect(r.twoD).toBe(true);
  expect(r.navigationPreserved).toBe(true);
  expect(r.roadClearance).toBe(true);
  expect(r.worldBounds.width).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('v318 landscape draws on portrait mobile with Canvas and keeps river flow active',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  const errors=await boot(page);
  const m=await page.evaluate(()=>{
    const map=window.__MAP_REALISM_V2__,tile=window.__DESKTOP_TERRAIN_TILES_V301__;
    const river=window.__RIVER_FLOW_2D_V299__;
    const before=tile.stats();
    draw();
    const first=tile.stats();
    draw();
    const second=tile.stats();
    const ripples=river.metrics();
    const road=window.NRTS_ROAD_NETWORK_V7||ROAD_NETWORK_V066;
    const bridgeTotal=WATER_CROSSINGS_V067.length;
    const perf=window.__MOBILE_RENDER_BUDGET_V1__.state();
    return{
      painterly:map.painterlyTerrain,
      width:canvas.width,height:canvas.height,
      maxWidth:Math.ceil(innerWidth*1.5)+1,
      culling:map.viewportCulling,
      reusedTerrain:second.hits>=first.hits,
      riverTracks:ripples.lanes,
      twoD:river.twoDOnly,
      bridgeTotal,
      roadCount:road.length,
      renderDpr:perf.renderDpr,
      tileVersion:tile.version
    };
  });
  expect(m.painterly).toBe(true);
  expect(m.culling).toBe(true);
  expect(m.width).toBeLessThanOrEqual(m.maxWidth);
  expect(m.reusedTerrain).toBe(true);
  expect(m.twoD).toBe(true);
  expect(m.riverTracks).toBe(7);
  expect(m.roadCount).toBeGreaterThan(2);
  expect(m.bridgeTotal).toBeGreaterThan(0);
  expect(m.renderDpr).toBeLessThanOrEqual(1.5);
  expect(errors).toEqual([]);
});
