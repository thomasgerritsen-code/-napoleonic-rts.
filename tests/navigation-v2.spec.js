const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');

async function openNavigationV2(page) {
  const pageErrors=[];
  page.on('pageerror', error=>pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed=135791357;
    Math.random=()=>{ seed=(seed*16807)%2147483647; return (seed-1)/2147483646; };
  });
  await page.goto('/?test=v071', {waitUntil:'networkidle'});
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM?.version==='0.7.1' &&
    window.NRTS_NAVIGATION_V2?.active &&
    window.NRTS?.subsystems.has('navigation') &&
    window.NRTS_ROAD_INDEX_V2 &&
    window.NRTS_ROAD_GRAPH_V2
  ));
  return pageErrors;
}

test('Architecture v2 owns road lookup and route planning without legacy v066 runtime patches', async ({page}) => {
  const errors=await openNavigationV2(page);
  const nav=await page.evaluate(() => ({
    diagnostics:window.NRTS.diagnostics.snapshot().subsystems.find(s=>s.name==='navigation'),
    stats:window.NRTS.subsystems.get('navigation').stats(),
    road:window.NRTS.subsystems.get('navigation').roadAt(1500,900)?.road?.name || null,
    bridge:window.NRTS.subsystems.get('navigation').crossingAt(1500,900)?.name || null,
    config:window.NRTS_CONFIG.navigation,
    retired:window.NRTS_LEGACY_MANIFEST.retiredFromRuntime
  }));

  expect(nav.diagnostics.meta.phase).toBe('architecture-v2');
  expect(nav.diagnostics.meta.legacyBridge).toBe(false);
  expect(nav.stats.roadIndex.segments).toBeGreaterThan(20);
  expect(nav.stats.roadGraph.nodes).toBeGreaterThan(20);
  expect(nav.road).toBe('Grande Chaussée');
  expect(nav.bridge).toBe('Pont de la Chaussée');
  expect(nav.config.bridge.centerlineTolerance).toBeGreaterThan(0);
  expect(nav.retired).toEqual(expect.arrayContaining(['src/v066-road-index.js','src/v066-route-fixes.js']));

  const html=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
  expect(html).toContain('src/systems/navigation/road-index.js');
  expect(html).toContain('src/systems/navigation/route-planner.js');
  expect(html).toContain('src/systems/navigation/bridge-corridors.js');
  expect(html).toContain('src/systems/navigation/bridge-safety.js');
  expect(html).not.toMatch(/<script[^>]+src=["']src\/v066-road-index\.js/);
  expect(html).not.toMatch(/<script[^>]+src=["']src\/v066-route-fixes\.js/);
  expect(errors).toEqual([]);
});

test('angled battalion approach clears Pont de la Chaussee corners without stalling', async ({page}) => {
  const errors=await openNavigationV2(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));

  const setup=await page.evaluate(() => {
    const nav=window.NRTS.subsystems.get('navigation');
    const corridor=nav.bridgeCorridor('pont-chaussee',-1);
    const start={x:corridor.approach.x-85,y:corridor.approach.y-90};
    const target={x:corridor.clear.x+140,y:corridor.clear.y+80};
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',start.x,start.y);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(target.x,target.y,0);
    return {id,corridor,start,target,nav:nav.bridgeState(id)};
  });

  expect(setup.nav.corridors.some(c=>c.id==='pont-chaussee')).toBe(true);

  let sawApproach=false;
  let sawCrossing=false;
  let maxDeckAnchorPerp=0;
  let maxDeckMemberPerp=0;
  let longestNearBridgeStall=0;
  let currentNearBridgeStall=0;
  let previousAnchor=null;
  let final=null;
  let everInWater=false;

  for(let i=0;i<220;i++){
    await page.evaluate(() => window.RTS_SIM.step(0.25));
    const sample=await page.evaluate(id => {
      const reg=getRegiment(id);
      const members=regimentMembers(reg).filter(u=>!u.dead&&!u.routing);
      const formation=window.__RTS_DEBUG__.formationState(id);
      const c=WATER_CROSSINGS_V067.find(c=>c.id==='pont-chaussee');
      const anchor=groupAnchorV068(reg);
      const aLocal=anchor?crossingLocalV068(c,anchor.x,anchor.y):null;
      const deckMembers=members
        .map(u=>({local:crossingLocalV068(c,u.x,u.y)}))
        .filter(x=>Math.abs(x.local.along)<=c.length/2+8);
      return {
        phase:formation.phase,
        centroid:formation.centroid,
        anchor,
        anchorWater:anchor?waterAtV067(anchor.x,anchor.y):false,
        traffic:formation.crossingTraffic,
        anchorLocal:aLocal,
        maxDeckMemberPerp:deckMembers.length?Math.max(...deckMembers.map(x=>Math.abs(x.local.perp))):0,
        minMemberX:members.length?Math.min(...members.map(u=>u.x)):0,
        nav:window.NRTS.subsystems.get('navigation').bridgeState(id)
      };
    },setup.id);

    everInWater ||= sample.anchorWater;
    sawApproach ||= sample.nav?.trafficState==='approach';
    sawCrossing ||= sample.nav?.trafficState==='crossing';

    if(sample.anchorLocal && Math.abs(sample.anchorLocal.along)<=135+10){
      maxDeckAnchorPerp=Math.max(maxDeckAnchorPerp,Math.abs(sample.anchorLocal.perp));
      maxDeckMemberPerp=Math.max(maxDeckMemberPerp,sample.maxDeckMemberPerp);
    }

    const nearBridge=sample.anchor && Math.hypot(sample.anchor.x-1500,sample.anchor.y-900)<330;
    if(nearBridge && previousAnchor){
      const moved=Math.hypot(sample.anchor.x-previousAnchor.x,sample.anchor.y-previousAnchor.y);
      if(moved<0.15) currentNearBridgeStall+=0.25;
      else currentNearBridgeStall=0;
      longestNearBridgeStall=Math.max(longestNearBridgeStall,currentNearBridgeStall);
    } else currentNearBridgeStall=0;
    previousAnchor=sample.anchor?{...sample.anchor}:null;

    final=sample;
    if(sample.phase==='formed' && (sample.centroid?.x||0)>setup.corridor.clear.x+45) break;
  }

  expect(sawApproach).toBe(true);
  expect(sawCrossing).toBe(true);
  expect(everInWater).toBe(false);
  expect(maxDeckAnchorPerp).toBeLessThanOrEqual(24);
  expect(maxDeckMemberPerp).toBeLessThan(55);
  expect(longestNearBridgeStall).toBeLessThan(1.5);
  expect(final?.phase).toBe('formed');
  expect(final?.centroid?.x).toBeGreaterThan(setup.corridor.clear.x+45);
  expect(errors).toEqual([]);
});

test('loose infantry follows bridge entry and exit portals instead of clipping a corner', async ({page}) => {
  const errors=await openNavigationV2(page);
  const result=await page.evaluate(() => {
    window.__RTS_DEBUG__.setPeaceMode(true);
    const nav=window.NRTS.subsystems.get('navigation');
    const corridor=nav.bridgeCorridor('pont-chaussee',-1);
    const start={x:corridor.approach.x-70,y:corridor.approach.y-72};
    const target={x:corridor.clear.x+125,y:corridor.clear.y+70};
    const u=createUnit('france','infantry',start.x,start.y);
    let maxStallFrames=0,stallFrames=0,lastX=u.x,lastY=u.y,sawBridgeState=false;

    for(let i=0;i<2400;i++){
      if(i%4===0) rebuildSpatialHash();
      moveToward(u,target.x,target.y,1/60,TYPES.infantry.speed);
      const moved=Math.hypot(u.x-lastX,u.y-lastY);
      sawBridgeState ||= !!u.navigationBridgeV2;
      if(u.navigationBridgeV2 && moved<0.01) stallFrames++; else stallFrames=0;
      maxStallFrames=Math.max(maxStallFrames,stallFrames);
      lastX=u.x; lastY=u.y;
      if(!u.navigationBridgeV2 && u.x>corridor.clear.x+30) break;
    }

    const final={x:u.x,y:u.y,bridgeState:u.navigationBridgeV2||null,waterCrossingId:u.waterCrossingIdV067||null};
    u.dead=true;
    return {corridor,final,maxStallSeconds:maxStallFrames/60,sawBridgeState};
  });

  expect(result.sawBridgeState).toBe(true);
  expect(result.maxStallSeconds).toBeLessThan(1.2);
  expect(result.final.x).toBeGreaterThan(result.corridor.clear.x+30);
  expect(result.final.bridgeState).toBeNull();
  expect(result.final.waterCrossingId).toBeNull();
  expect(errors).toEqual([]);
});
