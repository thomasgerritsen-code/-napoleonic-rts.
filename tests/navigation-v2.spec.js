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
    bridge:window.NRTS.subsystems.get('navigation').crossingAt(1500,900)?.name || null
  }));

  expect(nav.diagnostics.meta.phase).toBe('architecture-v2');
  expect(nav.diagnostics.meta.legacyBridge).toBe(false);
  expect(nav.stats.roadIndex.segments).toBeGreaterThan(20);
  expect(nav.stats.roadGraph.nodes).toBeGreaterThan(20);
  expect(nav.road).toBe('Grande Chaussée');
  expect(nav.bridge).toBe('Pont de la Chaussée');

  const html=fs.readFileSync(path.join(process.cwd(),'index.html'),'utf8');
  expect(html).toContain('src/systems/navigation/road-index.js');
  expect(html).toContain('src/systems/navigation/route-planner.js');
  expect(html).toContain('src/systems/navigation/bridge-corridors.js');
  expect(html).not.toMatch(/<script[^>]+src=["']src\/v066-road-index\.js/);
  expect(html).not.toMatch(/<script[^>]+src=["']src\/v066-route-fixes\.js/);
  expect(errors).toEqual([]);
});

test('angled battalion approach clears bridge corners without stalling', async ({page}) => {
  const errors=await openNavigationV2(page);
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));

  const id=await page.evaluate(() => {
    const id=window.__RTS_DEBUG__.createFreshInfantryRegiment('france',1050,700);
    window.__RTS_DEBUG__.selectRegiment(id);
    window.__RTS_DEBUG__.orderSelectedWithFacing(2200,900,0);
    return id;
  });

  const initial=await page.evaluate(id => ({
    nav:window.NRTS.subsystems.get('navigation').bridgeState(id),
    formation:window.__RTS_DEBUG__.formationState(id)
  }),id);
  expect(initial.nav.corridors.some(c=>c.id==='pont-chaussee')).toBe(true);
  expect(initial.formation.routeCrossings.some(c=>c.name==='Pont de la Chaussée')).toBe(true);

  let crossed=false;
  let formed=false;
  let maxDeckAnchorPerp=0;
  let maxDeckMemberPerp=0;
  let longestNearBridgeStall=0;
  let currentNearBridgeStall=0;
  let previousAnchor=null;
  let final=null;

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
        .map(u=>({u,local:crossingLocalV068(c,u.x,u.y)}))
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
        memberCount:members.length,
        nav:window.NRTS.subsystems.get('navigation').bridgeState(id)
      };
    },id);

    expect(sample.anchorWater).toBe(false);
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

    crossed ||= (sample.centroid?.x||0)>1700;
    formed ||= sample.phase==='formed' && (sample.centroid?.x||0)>2000;
    final=sample;
    if(formed) break;
  }

  expect(crossed).toBe(true);
  expect(formed).toBe(true);
  // The anchor must be essentially centered while it is on the bridge deck.
  expect(maxDeckAnchorPerp).toBeLessThanOrEqual(18);
  // Forced bridge column must fit inside the 112-unit Pont de la Chaussée deck.
  expect(maxDeckMemberPerp).toBeLessThan(55);
  // No repeated corner rollback may leave the battalion stationary at the bridge mouth.
  expect(longestNearBridgeStall).toBeLessThan(1.5);
  expect(final.minMemberX).toBeGreaterThan(1900);
  expect(final.nav.recoveries).toBeGreaterThanOrEqual(0);
  expect(errors).toEqual([]);
});
