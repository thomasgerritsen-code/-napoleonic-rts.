const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const REPORT_PATH = path.join(process.cwd(), 'test-results', 'movement-coverage-report.json');

async function openCoverageGame(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(() => {
    let seed = 773311;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  });
  await page.goto('/?test=movement-coverage', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.RTS_SIM &&
    window.__RTS_DEBUG__?.setPeaceMode &&
    window.NRTS_NAVIGATION_V2?.active &&
    window.__GAME_HEALTH__
  ));
  await page.evaluate(() => window.__RTS_DEBUG__.setPeaceMode(true));
  return pageErrors;
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
}

test('map traversal matrix covers every crossing, both directions and unit classes', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = await openCoverageGame(page);

  const report = await page.evaluate(() => {
    const results = [];
    const crossings = WATER_CROSSINGS_V067.map(c => ({ ...c }));

    function resetCoverageWorld() {
      resetGame();
      v05PeaceMode = true;
      gameOver = false;
      for (const u of units) u.dead = true;
      for (const r of regiments) r.destroyed = true;
      selectedUnits.clear();
      selectedBuilding = null;
      window.__GAME_HEALTH__.reset();
    }

    function makeGroup(kind, x, y) {
      if (kind === 'cavalry') {
        const made = [];
        for (let i = 0; i < 8; i++) made.push(createUnit('france', 'cavalry', x + (i % 4) * 24, y + Math.floor(i / 4) * 25));
        made.push(createUnit('france', 'officer', x + 35, y - 32));
        return createCavalryRegimentV06('france', made);
      }
      if (kind === 'artillery') {
        const gun = createUnit('france', 'artillery', x, y);
        const c1 = createUnit('france', 'infantry', x - 25, y - 14);
        const c2 = createUnit('france', 'infantry', x - 25, y + 14);
        return createArtilleryBatteryV06('france', gun, [c1, c2]);
      }
      const made = [];
      for (let i = 0; i < 18; i++) made.push(createUnit('france', 'infantry', x + (i % 9) * 16, y + Math.floor(i / 9) * 18));
      made.push(createUnit('france', 'officer', x + 55, y - 30));
      made.push(createUnit('france', 'drummer', x + 80, y - 30));
      return createRegiment('france', made);
    }

    function center(reg) {
      const living = regimentMembers(reg).filter(u => !u.dead);
      return living.length ? centroid(living) : { x: NaN, y: NaN };
    }

    function allMembersCleared(reg, c, side) {
      const direction = -side;
      const threshold = c.length / 2 + 24;
      const living = regimentMembers(reg).filter(u => !u.dead);
      return living.length > 0 && living.every(u => {
        if (waterAtV067(u.x, u.y)) return false;
        const local = crossingLocalV068(c, u.x, u.y);
        return local.along * direction > threshold;
      });
    }

    function runRoute(c, side, kind, formation, lateral) {
      resetCoverageWorld();
      const nav = window.NRTS_NAVIGATION_V2;
      const beforeRecoveries = nav.stats().bridgeCornerRecoveries;
      const beforeFollower = window.__BRIDGE_FOLLOWER_SAFETY_V1__?.stats?.() || {};
      const distance = c.length / 2 + 210;
      const start = crossingPointV068(c, side * distance, lateral);
      const target = crossingPointV068(c, -side * distance, -lateral * 0.35);
      const reg = makeGroup(kind, start.x, start.y);
      if (!reg) return { crossing: c.id, side, kind, formation, completed: false, reason: 'group-create-failed' };
      orderGroupPathV06(reg, target.x, target.y, formation, c.angle + (side < 0 ? 0 : Math.PI));

      let last = center(reg);
      let lastProgressAt = elapsed;
      let longestStall = 0;
      let recoveredStalls = 0;
      let activeStall = false;
      let hardStall = false;
      let completed = false;
      let steps = 0;

      for (; steps < 1800; steps++) {
        window.RTS_SIM.step(0.05);
        if (steps % 5) continue;
        const now = center(reg);
        if (!Number.isFinite(now.x) || !Number.isFinite(now.y)) break;
        const moved = Math.hypot(now.x - last.x, now.y - last.y);
        const remaining = Math.hypot(target.x - now.x, target.y - now.y);
        if (moved > 0.75) {
          if (activeStall) recoveredStalls++;
          activeStall = false;
          last = now;
          lastProgressAt = elapsed;
        } else {
          const stall = elapsed - lastProgressAt;
          longestStall = Math.max(longestStall, stall);
          if (stall > 1.25) activeStall = true;
          if ((reg.path?.length || 0) > 0 && stall > 12) { hardStall = true; break; }
        }
        const crossingComplete = c.type === 'bridge'
          ? allMembersCleared(reg, c, side)
          : remaining < 75;
        if (crossingComplete) { completed = true; break; }
      }

      const living = regimentMembers(reg).filter(u => !u.dead);
      const finalCenter = center(reg);
      const waterUnits = living.filter(u => waterAtV067(u.x, u.y)).length;
      const blockedTargets = living.filter(u => Number.isFinite(u.targetX) && segmentCrossesBlockedWaterV067(u.x, u.y, u.targetX, u.targetY)).length;
      const afterRecoveries = nav.stats().bridgeCornerRecoveries;
      const afterFollower = window.__BRIDGE_FOLLOWER_SAFETY_V1__?.stats?.() || {};
      return {
        crossing: c.id,
        crossingType: c.type,
        side,
        kind,
        formation,
        lateral,
        completed,
        hardStall,
        steps,
        elapsed: +(steps * 0.05).toFixed(2),
        remaining: Number.isFinite(finalCenter.x) ? +Math.hypot(target.x - finalCenter.x, target.y - finalCenter.y).toFixed(1) : null,
        longestStall: +longestStall.toFixed(2),
        recoveredStalls,
        bridgeRecoveries: afterRecoveries - beforeRecoveries,
        followerWaterRecoveries: (afterFollower.waterRecoveries || 0) - (beforeFollower.waterRecoveries || 0),
        preventedEarlyReleases: (afterFollower.preventedEarlyReleases || 0) - (beforeFollower.preventedEarlyReleases || 0),
        postReleaseGuards: (afterFollower.postReleaseGuards || 0) - (beforeFollower.postReleaseGuards || 0),
        waterUnits,
        blockedTargets,
        health: window.__GAME_HEALTH__.sample()
      };
    }

    const formations = ['line', 'column', 'square'];
    for (let ci = 0; ci < crossings.length; ci++) {
      const c = crossings[ci];
      for (const side of [-1, 1]) {
        results.push(runRoute(c, side, 'infantry', formations[(ci + (side > 0 ? 1 : 0)) % formations.length], side * 42));
        results.push(runRoute(c, side, 'cavalry', side < 0 ? 'line' : 'column', side * -34));
      }
      results.push(runRoute(c, -1, 'artillery', 'column', 18));
    }

    const failed = results.filter(r => !r.completed || r.hardStall || r.waterUnits || r.blockedTargets || r.health.errors?.length);
    const recovered = results.filter(r => r.recoveredStalls > 0 || r.bridgeRecoveries > 0 || r.followerWaterRecoveries > 0 || r.postReleaseGuards > 0);
    const hotspots = results
      .filter(r => r.longestStall > 1.25 || !r.completed || r.followerWaterRecoveries > 0 || r.postReleaseGuards > 0)
      .map(r => ({ crossing: r.crossing, kind: r.kind, side: r.side, longestStall: r.longestStall, completed: r.completed, hardStall:r.hardStall, recoveries: r.bridgeRecoveries + r.recoveredStalls + r.followerWaterRecoveries + r.postReleaseGuards }))
      .sort((a, b) => b.longestStall - a.longestStall);

    return {
      schema: 'napoleonic-rts-movement-coverage-v1',
      version: window.RTS_VERSION,
      crossings: crossings.length,
      routesTested: results.length,
      routesCompleted: results.filter(r => r.completed).length,
      failures: failed.length,
      recoveredRoutes: recovered.length,
      hotspots,
      results,
      pageHealth: window.__GAME_HEALTH__.report()
    };
  });

  writeReport(report);
  expect(report.crossings).toBeGreaterThanOrEqual(4);
  expect(report.routesTested).toBeGreaterThanOrEqual(20);
  expect(report.routesCompleted).toBe(report.routesTested);
  expect(report.failures).toBe(0);
  expect(pageErrors).toEqual([]);
});

test('representative whole-map road routes complete without hard stalls', async ({ page }) => {
  test.setTimeout(120_000);
  const pageErrors = await openCoverageGame(page);
  const sweep = await page.evaluate(() => {
    const roadById = id => ROAD_NETWORK_V066.find(r => r.id === id);
    const roadPoint = (id, index) => {
      const road = roadById(id);
      const p = road.points[index < 0 ? road.points.length + index : index];
      return { x:p.x, y:p.y, road:id };
    };
    const pairs = [
      { start:roadPoint('grande-chaussee', 1), target:roadPoint('grande-chaussee', -2) },
      { start:roadPoint('route-du-nord', 1), target:roadPoint('route-du-nord', -2) },
      { start:roadPoint('route-sud-ouest', 1), target:roadPoint('route-nord-est', -2) },
      { start:roadPoint('chemin-de-la-crete-ouest', 1), target:roadPoint('chemin-de-la-crete-est', -2) },
      { start:roadPoint('chemin-du-bois', -2), target:roadPoint('chemin-des-fermes-est', -2) },
      { start:roadPoint('chemin-des-fermes-sud', 1), target:roadPoint('chemin-des-fermes-sud', -2) },
      { start:roadPoint('voie-du-moulin', 1), target:roadPoint('voie-du-verger', -2) },
      { start:roadPoint('voie-de-la-ferme', -2), target:roadPoint('voie-de-la-lisiere', -2) }
    ];
    const results = [];

    for (let index = 0; index < pairs.length; index++) {
      resetGame(); v05PeaceMode = true; gameOver = false;
      for (const u of units) u.dead = true;
      for (const r of regiments) r.destroyed = true;
      const { start, target } = pairs[index];
      const made = [];
      for (let i = 0; i < 18; i++) made.push(createUnit('france','infantry',start.x+(i%9)*14,start.y+Math.floor(i/9)*16));
      made.push(createUnit('france','officer',start.x+40,start.y-25));
      made.push(createUnit('france','drummer',start.x+62,start.y-25));
      const reg = createRegiment('france', made);
      if (!reg) { results.push({ index, completed:false, hardStall:true, maxStall:0, inWater:0, pathLength:0, reason:'group-create-failed' }); continue; }
      orderGroupPathV06(reg, target.x, target.y, index % 2 ? 'column' : 'line', 0);
      let living = regimentMembers(reg).filter(u=>!u.dead);
      let last = centroid(living);
      const initial = { ...last };
      let lastMovedAt = elapsed;
      let maxStall = 0;
      let hardStall = false;
      let completed = false;
      for (let step = 0; step < 4800; step++) {
        window.RTS_SIM.step(.05);
        if (step % 10) continue;
        living = regimentMembers(reg).filter(u => !u.dead);
        if (!living.length) break;
        const c = centroid(living);
        const phase = reg.movementPhaseV063 || reg.marchV063?.phase || 'idle';
        const pathDone = (reg.path?.length || 0) === 0 && ['formed','idle','arrived'].includes(phase);
        if (pathDone || Math.hypot(c.x-target.x,c.y-target.y) < 120) { completed=true; break; }
        const moved = Math.hypot(c.x-last.x,c.y-last.y);
        if (moved > .8) { last=c; lastMovedAt=elapsed; }
        else {
          const stall=elapsed-lastMovedAt;
          maxStall=Math.max(maxStall,stall);
          if ((reg.path?.length || 0) > 0 && stall > 12) { hardStall=true; break; }
        }
      }
      const finalMembers = regimentMembers(reg).filter(u => !u.dead);
      const finalCenter = finalMembers.length ? centroid(finalMembers) : {x:NaN,y:NaN};
      const state = reg.crossingTrafficV068 ? { ...reg.crossingTrafficV068 } : null;
      results.push({
        index,
        from:start.road,
        to:target.road,
        completed,
        hardStall,
        maxStall:+maxStall.toFixed(2),
        inWater:finalMembers.filter(u=>waterAtV067(u.x,u.y)).length,
        blockedTargets:finalMembers.filter(u=>Number.isFinite(u.targetX)&&segmentCrossesBlockedWaterV067(u.x,u.y,u.targetX,u.targetY)).length,
        pathLength:reg.path?.length||0,
        pathIndex:reg.pathIndex||0,
        moved:Number.isFinite(finalCenter.x)?+Math.hypot(finalCenter.x-initial.x,finalCenter.y-initial.y).toFixed(1):0,
        remaining:Number.isFinite(finalCenter.x)?+Math.hypot(finalCenter.x-target.x,finalCenter.y-target.y).toFixed(1):null,
        phase:reg.movementPhaseV063||reg.marchV063?.phase||'idle',
        crossingState:state
      });
    }
    return results;
  });

  expect(sweep).toHaveLength(8);
  expect(sweep.filter(r => !r.completed)).toEqual([]);
  expect(sweep.filter(r => r.hardStall)).toEqual([]);
  expect(sweep.filter(r => r.inWater > 0)).toEqual([]);
  expect(sweep.filter(r => r.blockedTargets > 0)).toEqual([]);
  expect(pageErrors).toEqual([]);
});
