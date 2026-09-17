const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const NORTH_STAR_SEED = 16092026;

function ensureOutputDir() {
  const outputDir = path.resolve('test-results');
  fs.mkdirSync(outputDir, { recursive: true });
  return outputDir;
}

async function openNorthStar(page) {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.addInitScript(seedValue => {
    let seed = seedValue;
    Math.random = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
  }, NORTH_STAR_SEED);
  await page.goto('/?test=north-star-visual-v1', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => Boolean(
    window.__RTS_DEBUG__?.runScenario &&
    window.__RTS_DEBUG__?.northStarScenario &&
    window.__RTS_DEBUG__?.setPeaceMode &&
    window.__RTS_DEBUG__?.simulationSnapshot &&
    window.__RTS_DEBUG__?.audit
  ));
  return pageErrors;
}

async function settleFrames(page, count = 3) {
  await page.evaluate(async frameCount => {
    for (let i = 0; i < frameCount; i += 1) {
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
  }, count);
}

test('North Star battle is reproducible and emits desktop/mobile visual baseline candidates', async ({ page }, testInfo) => {
  const outputDir = ensureOutputDir();
  await page.setViewportSize({ width: 1440, height: 900 });
  const pageErrors = await openNorthStar(page);

  const setup = await page.evaluate(() => {
    const ok = window.__RTS_DEBUG__.runScenario('north-star');
    window.__RTS_DEBUG__.setPeaceMode(true);

    // Golden captures need the complete fixed battlefield, not player fog-of-war.
    // This changes only the deterministic test fixture's explored-cell state; it does
    // not alter production visibility/fog authority or renderer behaviour.
    if (typeof exploredCells !== 'undefined' && typeof EXPLORE_CELL === 'number') {
      for (let y = 0; y <= WORLD.height; y += EXPLORE_CELL) {
        for (let x = 0; x <= WORLD.width; x += EXPLORE_CELL) {
          exploredCells.add(`${Math.floor(x / EXPLORE_CELL)},${Math.floor(y / EXPLORE_CELL)}`);
        }
      }
    }

    const meta = window.__RTS_DEBUG__.northStarScenario();
    const snapshot = window.__RTS_DEBUG__.simulationSnapshot();
    const batteryDiagnostics = regiments
      .filter(reg => !reg.destroyed && groupKindV06(reg) === 'artillery')
      .map(reg => {
        const cannon = artilleryForGroupV06(reg);
        const crew = artilleryCrewV06(reg);
        return {
          id: reg.id,
          side: reg.side,
          memberIds: [...(reg.memberIds || [])],
          crewIds: [...(reg.crewIds || [])],
          cannon: cannon ? { id: cannon.id, dead: !!cannon.dead, regimentId: cannon.regimentId } : null,
          crew: crew.map(unit => ({ id: unit.id, dead: !!unit.dead, regimentId: unit.regimentId, type: unit.type })),
          operational: !!(cannon && canArtilleryOperateV06(cannon))
        };
      });
    const audit = window.__RTS_DEBUG__.audit();
    const bySideType = {};
    for (const unit of snapshot.units || []) {
      if (unit.dead) continue;
      const key = `${unit.side}:${unit.type}`;
      bySideType[key] = (bySideType[key] || 0) + 1;
    }
    return {
      ok,
      meta,
      audit,
      batteryDiagnostics,
      livingUnits: (snapshot.units || []).filter(unit => !unit.dead).length,
      livingGroups: (snapshot.groups || []).filter(group => !group.destroyed).length,
      bySideType,
      canvas: {
        width: document.getElementById('game')?.width || 0,
        height: document.getElementById('game')?.height || 0
      }
    };
  });

  await settleFrames(page);
  const desktopPath = path.join(outputDir, 'north-star-visual-desktop.png');
  const desktopImage = await page.locator('#game').screenshot({ path: desktopPath, animations: 'disabled' });
  await testInfo.attach('north-star-desktop-baseline-candidate', { body: desktopImage, contentType: 'image/png' });

  await page.setViewportSize({ width: 844, height: 390 });
  await settleFrames(page, 4);
  const mobilePath = path.join(outputDir, 'north-star-visual-mobile-landscape.png');
  const mobileImage = await page.locator('#game').screenshot({ path: mobilePath, animations: 'disabled' });
  await testInfo.attach('north-star-mobile-baseline-candidate', { body: mobileImage, contentType: 'image/png' });

  const report = {
    version: 1,
    scenario: 'north-star-v1',
    deterministicSeed: NORTH_STAR_SEED,
    baselineState: 'candidate-capture',
    setup
  };
  fs.writeFileSync(path.join(outputDir, 'north-star-visual-report.json'), JSON.stringify(report, null, 2));
  await testInfo.attach('north-star-visual-report', {
    body: Buffer.from(JSON.stringify(report, null, 2)),
    contentType: 'application/json'
  });

  expect(pageErrors).toEqual([]);
  expect(setup.ok).toBe(true);
  expect(setup.audit.errors || []).toEqual([]);
  expect(setup.meta?.id).toBe('north-star-v1');
  expect(setup.meta?.groups?.length).toBeGreaterThanOrEqual(8);
  expect(setup.livingGroups).toBeGreaterThanOrEqual(8);
  expect(setup.livingUnits).toBeGreaterThanOrEqual(100);
  expect(setup.bySideType['france:infantry'] || 0).toBeGreaterThan(0);
  expect(setup.bySideType['britain:infantry'] || 0).toBeGreaterThan(0);
  expect(setup.bySideType['france:cavalry'] || 0).toBeGreaterThan(0);
  expect(setup.bySideType['britain:cavalry'] || 0).toBeGreaterThan(0);
  expect(setup.bySideType['france:artillery'] || 0).toBeGreaterThan(0);
  expect(setup.bySideType['britain:artillery'] || 0).toBeGreaterThan(0);
  expect(setup.canvas.width).toBeGreaterThan(0);
  expect(setup.canvas.height).toBeGreaterThan(0);
});
