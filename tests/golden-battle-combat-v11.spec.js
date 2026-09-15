const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const GOLDEN_SEED = 18150914;

function persistReport(report) {
  const outputDir = path.resolve('test-results');
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, 'golden-battle-combat-v11-report.json'), JSON.stringify(report, null, 2));
}

test('Golden Battle V1.1 guarantees sustained musket and artillery combat coverage', async ({ page }, testInfo) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(seedValue => {
    let seed = seedValue;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }, GOLDEN_SEED);
  await page.goto('/?test=golden-battle-combat-v11', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__RTS_DEBUG__?.runScenario &&
    window.__RTS_DEBUG__?.createFreshInfantryRegiment &&
    window.__RTS_DEBUG__?.formationState &&
    window.__COMBAT_ANIMATIONS_V1__?.animationFor &&
    window.RTS_SIM?.step
  ));

  const setup = await page.evaluate(() => {
    window.__RTS_DEBUG__.runScenario('regiment-duel');
    window.__RTS_DEBUG__.setPeaceMode(false);
    const infantryIds = [];
    for (let row = 0; row < 5; row += 1) {
      const y = 610 + row * 175;
      const france = window.__RTS_DEBUG__.createFreshInfantryRegiment('france', 1510, y);
      const britain = window.__RTS_DEBUG__.createFreshInfantryRegiment('britain', 2090, y + 12);
      infantryIds.push(france, britain);
      window.__RTS_DEBUG__.selectRegiment(france);
      window.__RTS_DEBUG__.orderSelectedWithFacing(1840, y, 0);
      window.__RTS_DEBUG__.selectRegiment(britain);
      window.__RTS_DEBUG__.orderSelectedWithFacing(1960, y + 12, 180);
    }

    const batteryIds = [];
    for (const side of ['france', 'britain']) {
      const x = side === 'france' ? 1730 : 2070;
      const y = side === 'france' ? 530 : 1370;
      const facing = side === 'france' ? 0 : Math.PI;
      const cannonCandidate = createUnit(side, 'artillery', x, y);
      const crewCandidates = [
        createUnit(side, 'infantry', x + (side === 'france' ? -24 : 24), y - 12),
        createUnit(side, 'infantry', x + (side === 'france' ? -24 : 24), y + 12)
      ];
      cannonCandidate.facing = facing;
      const battery = createArtilleryBatteryV06(side, cannonCandidate, crewCandidates);
      if (!battery) continue;
      const cannon = artilleryForGroupV06(battery);
      if (!cannon) continue;
      cannon.x = cannon.targetX = x;
      cannon.y = cannon.targetY = y;
      cannon.facing = facing;
      battery.facing = battery.targetFacing = facing;
      for (const crew of artilleryCrewV06(battery)) {
        crew.x = crew.targetX = x + (side === 'france' ? -24 : 24);
        crew.y = crew.targetY = y + (crew.id % 2 ? -12 : 12);
        crew.facing = facing;
      }
      batteryIds.push(battery.id);
    }
    rebuildSpatialHash();
    return { infantryIds, batteryIds };
  });

  const coverage = await page.evaluate(async ({ infantryIds, batteryIds }) => {
    const infantryStates = () => infantryIds.map(id => window.__RTS_DEBUG__.formationState(id)).filter(Boolean);
    const batteryCannons = () => batteryIds.map(id => {
      const reg = regiments.find(r => r.id === id && !r.destroyed);
      return reg ? artilleryForGroupV06(reg) : null;
    }).filter(Boolean);
    const initialLiving = units.filter(u => !u.dead && (u.side === 'france' || u.side === 'britain')).length;
    let musketCombatFrames = 0;
    let artilleryFireFrames = 0;
    let maxEngagedRegiments = 0;
    let maxProjectiles = 0;
    let maxParticles = 0;

    for (let frame = 0; frame < 180; frame += 1) {
      window.RTS_SIM.step(1 / 30);
      await new Promise(resolve => requestAnimationFrame(resolve));
      const states = infantryStates();
      const engaged = states.filter(state => state.engagement?.mode === 'fire').length;
      if (engaged > 0) musketCombatFrames += 1;
      maxEngagedRegiments = Math.max(maxEngagedRegiments, engaged);
      if (batteryCannons().some(cannon => window.__COMBAT_ANIMATIONS_V1__.animationFor(cannon)?.kind === 'artillery-fire')) artilleryFireFrames += 1;
      maxProjectiles = Math.max(maxProjectiles, projectiles.length);
      maxParticles = Math.max(maxParticles, particles.length);
    }

    const finalLiving = units.filter(u => !u.dead && (u.side === 'france' || u.side === 'britain')).length;
    return {
      initialLiving,
      finalLiving,
      casualties: initialLiving - finalLiving,
      musketCombatFrames,
      artilleryFireFrames,
      maxEngagedRegiments,
      maxProjectiles,
      maxParticles,
      batteryCount: batteryIds.length,
      batteriesOperational: batteryIds.every(id => {
        const reg = regiments.find(r => r.id === id && !r.destroyed);
        const cannon = reg ? artilleryForGroupV06(reg) : null;
        return Boolean(cannon && canArtilleryOperateV06(cannon));
      })
    };
  }, setup);

  const report = { version: '1.1', scenario: 'golden-battle-combat-v11', deterministicSeed: GOLDEN_SEED, setup, coverage };
  persistReport(report);
  await testInfo.attach('golden-battle-combat-v11-report', { body: Buffer.from(JSON.stringify(report, null, 2)), contentType: 'application/json' });
  await testInfo.attach('golden-battle-combat-v11-frame', { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

  expect(pageErrors).toEqual([]);
  expect(setup.infantryIds.length).toBe(10);
  expect(coverage.batteryCount).toBe(2);
  expect(coverage.batteriesOperational).toBe(true);
  expect(coverage.musketCombatFrames).toBeGreaterThan(20);
  expect(coverage.maxEngagedRegiments).toBeGreaterThanOrEqual(4);
  expect(coverage.artilleryFireFrames).toBeGreaterThan(0);
  expect(coverage.maxProjectiles).toBeGreaterThan(0);
  expect(coverage.casualties).toBeGreaterThan(0);
});
